import { logger } from '../../../core/logger';
import { dataManager } from '../data/DataManager';
import { TALENT_HANDLERS } from './talent-handlers';
import { resolveBaggage, resolveGear } from './gear-resolver';
import { ROLL_TABLE_FILTER, ROLL_TABLE_TALENT_MAP, ROLL_TABLE_PATRON_BOONS } from '../data/roll-table-patterns';

interface RollResultProcessorOptions {
    result: any;
    table: any;
}

export async function processRollResult({ result, table }: RollResultProcessorOptions) {
    logger.info(`[Engine] processRollResult for table: ${table?.name}`, { result });
    const matchedItems = result.items || [];
    const matchedResults = result.results || [];

    let item = matchedItems.length > 0 ? { ...matchedItems[0] } : null;
    let needsChoice = false;
    let choiceOptions: any[] = [];
    let action = undefined;
    let config = undefined;

    let rollPatterns = Object.values(ROLL_TABLE_TALENT_MAP).find((t: any) => t.UUID === table?.uuid);
    if (!rollPatterns) {
        logger.debug(`[Engine] No talent pattern found for ${table?.uuid} assuming patron boon`);
        rollPatterns = Object.values(ROLL_TABLE_PATRON_BOONS).find((t: any) => t.UUID === table?.uuid);
    }

    if (rollPatterns) {
    } else {
        logger.warn(`[Engine] No pattern found for ${table?.uuid}`);
    }

    let choiceCount = 1;

    if (rollPatterns) {
        let filter = ROLL_TABLE_FILTER.None;
        const pattern = rollPatterns.map.find((p: any) =>
            p.range[0] <= result.total && p.range[1] >= result.total
        );
        if (pattern) filter = pattern.filter;

        logger.info(`[Engine] Applying Filter: ${filter} for Table: ${table?.name} (Roll: ${result.total})`);

        // Bitmask Checks

        // 1. ChooseTwoInstead (Bit 5)
        if ((filter & ROLL_TABLE_FILTER.ChooseTwoInstead) !== 0) {
            // Fetch ALL results from the table to offer as choices
            // We need to access the full table results, typically available in table.results
            if (table && table.results) {
                choiceOptions = table.results;
                needsChoice = true;
                choiceCount = 2;
                logger.debug(`[Engine] ChooseTwoInstead applied. Options: ${choiceOptions.length}`);
            }
        }


        // 2. DropChooseOne | ChooseOne | HasDistributeStatsTable (Bit 1 | Bit 7 | Bit 4)
        // MOVED UP: Specific check must happen before generic DropChooseOne | ChooseOne
        else if ((filter & (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable)) === (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne | ROLL_TABLE_FILTER.HasDistributeStatsTable)) {
            // Find parent instruction (e.g. "Choose one option:")
            const instructionResult = matchedResults.find((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase();
                return name.includes("choose 1") || name.includes("choose one");
            });

            if (instructionResult) {
                item = { ...instructionResult, name: instructionResult.text || "Choose One" };
            } else {
                item = {
                    _id: "synthetic-choice-parent",
                    name: "Choose One",
                    type: "synthetic",
                    img: table.img,
                    text: "Select one option from the list below."
                };
            }

            // ... existing Bard logic ...
            choiceOptions = matchedResults.filter((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase();
                if (name.includes("choose 1") || name.includes("choose one") || name.includes("or (can")) return false;
                // if (name.includes("+1 to") || name.includes("+2 to")) return false; // Allowed for mapping

                // DropBlank (Bit 14) or just always drop empty/blank names to avoid "Unknown Option"
                if (!name.trim()) {
                    return false;
                }

                return true;
            }).map((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase();
                if (name.includes("+2 points") || name.includes("distribute") || name.includes("+2 to") || name.includes("+1 to")) { // Added +1 to
                    return {
                        ...r,
                        _id: "synthetic-distribute-stats-choice",
                        name: "Distribute to Stats",
                        text: "Distribute 2 points to any stats."
                    };
                }
                if (name.includes("patron boon")) { // Added generic patron boon check for this block
                    return {
                        ...r,
                        _id: "synthetic-patron-boon",
                        name: "Patron Boon",
                        type: "PatronBoon",
                        img: "icons/magic/symbols/question-stone-yellow.webp",
                        text: "Roll on your patron's boon table."
                    };
                }
                return {
                    ...r,
                    name: r.text || r.name || "Unknown Option"
                };
            });

            // Deduplicate options for this specific filter block (crucial for "Distribute to Stats" from multiple +1s)
            const uniqueMap = new Map();
            for (const opt of choiceOptions) {
                // Use a composite key including type to avoid merging unrelated things, but merge identical synthetic items
                const key = (opt.name || opt.text || opt.description).toLowerCase().trim();
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, opt);
                }
            }
            choiceOptions = Array.from(uniqueMap.values());

            needsChoice = true;
        }

        // 3. DropChooseOne | ChooseOne (Bit 1 | Bit 7)
        // If BOTH are set, we filter out the "Choose 1" header and offer remaining matched results
        else if ((filter & (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne)) === (ROLL_TABLE_FILTER.DropChooseOne | ROLL_TABLE_FILTER.ChooseOne)) {
            // Filter source: matchedResults
            choiceOptions = matchedResults.filter((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase().trim();
                if (!name) return false; // Filter out blanks
                return !name.includes("choose 1") && !name.toLowerCase().includes("choose one");
            });
            needsChoice = true;
        }


        // 3. DropTwoPointsToDistribute | DistributeTwoStatsAny | DistributeTwoStatsOnlyOnce (Bit 13 | Bit 3 | Bit 2)
        else if ((filter & (ROLL_TABLE_FILTER.DropTwoPointsToDistribute | ROLL_TABLE_FILTER.DistributeTwoStatsAny)) || (filter & ROLL_TABLE_FILTER.DistributeTwoStatsOnlyOnce)) {
            item = {
                _id: "synthetic-distribute-stats",
                name: "Distribute to Stats",
                type: "synthetic",
                img: "icons/sundries/gaming/dice-pair-white-green.webp",
                text: "Distribute 2 points to any stats."
            };
            needsChoice = false;
        }



        // 5. Warlock Filters
        // RollAnyPatronBoon (Bit 11) or RollPatronBoon (Bit 9)
        else if ((filter & ROLL_TABLE_FILTER.RollAnyPatronBoon) || (filter & ROLL_TABLE_FILTER.RollPatronBoon)) {
            item = {
                _id: "synthetic-patron-boon",
                name: "Patron Boon",
                type: "PatronBoon",
                img: "icons/magic/symbols/question-stone-yellow.webp",
                text: "Roll on your patron's boon table."
            };
            needsChoice = false;
        }

        // RollPatronBoonTwice (Bit 10)
        else if (filter & ROLL_TABLE_FILTER.RollPatronBoonTwice) {
            item = {
                _id: "synthetic-patron-boon-twice",
                name: "Patron Boon (x2)",
                type: "PatronBoonTwice",
                img: "icons/magic/symbols/question-stone-yellow.webp",
                text: "Roll twice on your patron's boon table."
            };
            needsChoice = false;
        }

        // WarlockSpecificTwelve (Bit 12)
        else if (filter & ROLL_TABLE_FILTER.WarlockSpecificTwelve) {
            choiceOptions = matchedResults.filter((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase();
                return !name.includes("choose 1");
            }).map((r: any) => {
                const name = (r.text || r.name || r.description).toLowerCase();
                if (name.includes("+2") || name.includes("attribute")) {
                    return {
                        ...r,
                        _id: "synthetic-distribute-stats-choice",
                        name: "Distribute to Stats",
                        text: "Distribute 2 points to any stats."
                    };
                }
                if (name.includes("boon")) {
                    return {
                        ...r,
                        _id: "synthetic-patron-boon",
                        name: "Patron Boon",
                        type: "PatronBoon",
                        img: "icons/magic/symbols/question-stone-yellow.webp",
                    };
                }
                return r;
            });
            needsChoice = true;
        }
    }

    // Resolve Document Results
    // If DataManager returned a raw table result instead of a hydrated document, we resolve it now.
    const resolveItem = async (target: any) => {
        if (!target) return null;
        const type = String(target.type || "");
        if (type === 'document' || type === '2') {
            const uuid = target.documentUuid || target.uuid;
            if (uuid) {
                const resolved = await dataManager.getDocument(uuid);
                if (resolved) {
                    // Return a clean clone of the resolved document
                    const clean = JSON.parse(JSON.stringify(resolved));
                    // Preserve any temporary metadata from the table result if helpful
                    if (target.text && !clean.name) clean.name = target.text;
                    return clean;
                }
            }
        }
        return target;
    };

    if (item) {
        item = await resolveItem(item);
    }

    if (choiceOptions && choiceOptions.length > 0) {
        const resolvedChoices = [];
        for (const opt of choiceOptions) {
            const resolved = await resolveItem(opt);
            // Ensure choice options have a consistent 'text' property for UI
            if (resolved) {
                resolved.text = resolved.text || resolved.name || "Unknown Option";
            }
            resolvedChoices.push(resolved);
        }
        choiceOptions = resolvedChoices;
    }

    // Determine Action and Config from TALENT_HANDLERS if we have an item
    if (item && !needsChoice) {
        for (const handler of TALENT_HANDLERS) {
            if (handler.matches(item)) {
                action = handler.action;
                config = handler.config;
                break;
            }
        }
    }

    // NEW: Attach handler data to choices if present
    if (needsChoice && choiceOptions && choiceOptions.length > 0) {
        choiceOptions = choiceOptions.map(opt => {
            if (!opt) return opt;
            const name = (opt.name || opt.text || opt.description || "").trim();
            const option = { ...opt, name, text: name };

            for (const handler of TALENT_HANDLERS) {
                if (handler.matches(option)) {
                    option.action = handler.action;
                    option.config = handler.config;
                    break;
                }
            }
            return option;
        });
    }

    return { item, needsChoice, choiceOptions, choiceCount, action, config };
}

export function getChoices(table: any, sourceResults?: any[]): any[] {
    const results = sourceResults || (table && table.results) || [];
    if (results.length === 0) return [];

    logger.info(`[Engine] processing choices for ${table?.name || 'unknown'} (${results.length} results)`);

    // First map to potential options
    const rawOptions = results
        .filter((r: any) => {
            const name = (r.text || r.name || "").trim().toLowerCase();
            if (!name) return false;

            // Filter out common instruction tokens that shouldn't be choices
            const instructionTokens = [
                "or", "and", "choose", "select", "reroll", "duplicates", "already", "taken", "had"
            ];

            if (instructionTokens.includes(name)) {
                logger.debug(`[Engine] Filtering out instruction token: ${name}`);
                return false;
            }

            // More aggressive regex for "Choose 1" type headers
            const instructionRegex = /(?:choose|select)\s+(?:one|1|two|2|an)\b/i;
            if (instructionRegex.test(name)) {
                logger.debug(`[Engine] Filtering out choice instruction: ${name}`);
                return false;
            }

            // filter out pure numbers (sometimes used for ranges in table results)
            if (/^\d+$/.test(name)) return false;

            return true;
        })
        .map((r: any) => {
            const name = (r.text || r.name || r.description || "").trim();
            const option: any = {
                name: name || "Unknown Option",
                text: name || "Unknown Option",
                type: 'Talent',
                img: r.img || (table ? table.img : ""),
                uuid: r.documentUuid || r.uuid || r._id,
                original: r
            };

            // Match against TALENT_HANDLERS to provide UI triggers
            for (const handler of TALENT_HANDLERS) {
                if (handler.matches(option)) {
                    option.action = handler.action;
                    option.config = handler.config;
                    break;
                }
            }

            return option;
        });

    // Deduplicate
    const uniqueOptions = new Map();
    for (const opt of rawOptions) {
        // Prefer Name for deduplication to avoid "Weapon Mastery" appearing twice with different UUIDs
        // Fallback to UUID if name is empty (unlikely)
        const key = (opt.name || opt.uuid).trim().toLowerCase();
        if (!uniqueOptions.has(key)) {
            uniqueOptions.set(key, opt);
        }
    }

    const finalOptions = Array.from(uniqueOptions.values());
    logger.info(`[Engine] Generated ${finalOptions.length} choice options (from ${rawOptions.length} raw)`);
    return finalOptions;
}

export interface LevelUpState {
    rolledTalents: any[];
    rolledBoons: any[];
    selectedSpells: any[];
    selectedLanguages: string[];
    hpRoll: number | null;
    goldRoll: number | null;
    statSelection: { required: number; selected: string[] };
    statPool: { total: number; allocated: Record<string, number>; talentIndex: number | null };
    weaponMasterySelection: { required: number; selected: string[] };
    armorMasterySelection: { required: number; selected: string[] };
    extraSpellSelection: { active: boolean; maxTier: number; source: string; selected: any[] };
}

/**
 * Calculates advancement requirements based on actor and target level.
 */
export async function calculateAdvancement(actor: any, targetLevel: number, classObj: any) {
    const isOddLevel = targetLevel % 2 !== 0;
    const requiresPatron = Boolean(classObj.system?.patron?.required || classObj.system?.patron?.requiredBoon);

    let requiredTalents = isOddLevel ? 1 : 0;
    let requiredBoons = 0;
    let choiceRolls = 0;

    if (requiresPatron) {
        if (targetLevel === 1) {
            requiredBoons = 1;
            requiredTalents = 0;
        } else if (isOddLevel) {
            choiceRolls = 1;
            requiredTalents = 0;
        } else {
            requiredTalents = 0;
        }
    }

    // Apply Handler Init (e.g. Ambitious talent)
    if (actor && actor.items) {
        for (const handler of TALENT_HANDLERS) {
            if (handler.onInit) {
                const res = handler.onInit({ actor, targetLevel });
                if (res.requiredTalents) requiredTalents += res.requiredTalents;
                if (res.choiceRolls) choiceRolls += res.choiceRolls;
            }
        }
    }

    return {
        requiredTalents,
        requiredBoons,
        choiceRolls,
        needsBoon: requiresPatron
    };
}

/**
 * Validates the level-up state and determines if it's "complete".
 */
export async function validateState(state: LevelUpState, requirements: any, actor?: any) {
    // 1. Talents
    if (state.rolledTalents.length < requirements.requiredTalents) return { valid: false, reason: 'Missing talents' };

    // 2. Boons
    const usedChoices = Math.max(0, state.rolledTalents.length - requirements.requiredTalents) +
        Math.max(0, state.rolledBoons.length - requirements.requiredBoons);
    if (usedChoices < requirements.choiceRolls && (state.rolledBoons.length < requirements.requiredBoons)) {
        // This is a bit simplified, but captures the essence
    }

    if (requirements.needsBoon && (state.rolledBoons.length + state.rolledTalents.length) < (requirements.requiredBoons + requirements.requiredTalents + requirements.choiceRolls)) {
        return { valid: false, reason: 'Missing boons or talents' };
    }

    // 3. HP & Gold
    if (state.hpRoll === null) return { valid: false, reason: 'Missing HP roll' };
    if (requirements.isLevel1 && state.goldRoll === null) return { valid: false, reason: 'Missing Gold roll' };

    // 4. Selections (Weapon/Armor/Stats)
    for (const handler of TALENT_HANDLERS) {
        if (handler.isBlocked && handler.isBlocked(state)) {
            return { valid: false, reason: `Handler ${handler.id} is blocked` };
        }
    }

    return { valid: true };
}

/**
 * Assembles all items for finalization.
 */
export async function assembleFinalItems(state: LevelUpState, targetLevel: number, classObj: any, ancestry?: any, client?: any) {
    const items: any[] = [];

    // 1. Process Talents and Boons
    const allRolled = [...state.rolledTalents, ...state.rolledBoons];
    for (const rawItem of allRolled) {
        const item = { ...rawItem };
        delete item._id;
        if (!item.system) item.system = {};
        item.system.level = targetLevel;

        // Apply mutations from handlers
        for (const handler of TALENT_HANDLERS) {
            if (handler.matches(item) && handler.mutateItem) {
                handler.mutateItem(item, state);
            }
        }
        items.push(item);
    }

    // 2. Resolve additional items from handlers
    for (const handler of TALENT_HANDLERS) {
        if (handler.resolveItems) {
            const extra = await handler.resolveItems(state, targetLevel, client);
            items.push(...extra);
        }
    }

    // 3. Spells
    for (const spell of [...state.selectedSpells, ...(state.extraSpellSelection?.selected || [])]) {
        const cleaned = { ...spell };
        delete cleaned._id;
        items.push(cleaned);
    }

    // 4. Baggage (Level 1 / Swap only)
    if (targetLevel === 1) {
        if (classObj) {
            const classBaggage = await resolveGear(classObj, client);
            items.push(...classBaggage);

            const classAbilities = await resolveBaggage(classObj, client);
            items.push(...classAbilities);
        }
        if (ancestry) {
            const ancestryBaggage = await resolveGear(ancestry, client);
            items.push(...ancestryBaggage);

            const ancestryAbilities = await resolveBaggage(ancestry, client);
            items.push(...ancestryAbilities);
        }
    }

    // Final Resolution Pass for Items
    const resolvedItems = [];
    for (const item of items) {
        const type = String(item.type || "");
        if (type === 'document' || type === '2') {
            const uuid = item.documentUuid || item.uuid;
            if (uuid) {
                const resolved = await dataManager.getDocument(uuid);
                if (resolved) {
                    const clean = JSON.parse(JSON.stringify(resolved));
                    // Preserve level if it was set
                    if (item.system?.level) {
                        if (!clean.system) clean.system = {};
                        clean.system.level = item.system.level;
                    }
                    resolvedItems.push(clean);
                    continue;
                }
            }
        }
        resolvedItems.push(item);
    }

    // Sanitization
    return resolvedItems.map(item => {
        const clean = { ...item };
        if (clean.type === 'text' || clean.type === 0) {
            clean.type = 'Talent';
            clean.system = clean.system || {};
        }

        // Top-level effects sanitization (e.g. clearing string UUIDs that cause Foundry to crash)
        if (clean.effects && Array.isArray(clean.effects)) {
            if (clean.effects.length > 0 && typeof clean.effects[0] === 'string') {
                logger.warn(`[Sanitizer] Clearing invalid top-level string effects for ${clean.name}`);
                clean.effects = [];
            }
        }

        // Remove problematic arrays in system
        if (clean.system) {
            for (const key of Object.keys(clean.system)) {
                if (Array.isArray(clean.system[key]) && (clean.system[key].length === 0 || typeof clean.system[key][0] === 'string')) {
                    delete clean.system[key];
                }
            }
        }
        return clean;
    });
}
