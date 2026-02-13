import { logger } from '../../../core/logger';
import { dataManager } from '../data/DataManager';
import { TALENT_HANDLERS } from './talent-handlers';
import { resolveBaggage, resolveGear } from './gear-resolver';

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

    if (!item) {
        logger.warn("[Engine] processRollResult: No item found in result", result);
        // Fallback: If result has text, maybe it's a raw text result
        if (result.text) {
            item = { name: "", text: result.text, type: "text", original: result };
            logger.info("[Engine] Recovered item from raw result text");
        }
    }

    // Strategy 1: Constrained Choice
    // If multiple functional items match the roll range, offer a choice between ONLY those items.
    // Also, if a SINGLE item contains " or ", split it into sub-choices.
    const functionalResults = matchedResults.filter((r: any) => {
        const text = (r.text || r.name || "").trim().toLowerCase();

        // SPECIAL FILTER: Bard Level 12 Table (ZzffJkaIfmdPzdE7)
        // Remove "Distribute to Stats" (redundant) but KEEP "Or +2 points to distribute..."
        // Also remove individual "+1/2 to Stat" entries to prevent UI bloat.
        if (table?._id === "ZzffJkaIfmdPzdE7") {
            const isRedundantDistribute = text.includes("distribute") && !text.includes("points");
            const isChooseHeader = text.includes("choose 1");

            // Filter individual stat boosts
            const stats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
            const isStatBoost = text.includes('+1 to') || text.includes('+2 to');
            const involvesStat = stats.some(s => text.includes(s));
            const isStatEntry = isStatBoost && involvesStat;

            // Check if we have the "Unified" distribute option ("Or +2 points...")
            const hasUnifiedDistribute = matchedResults.some((r: any) =>
                (r.text || r.name || "").toLowerCase().includes("points")
            );

            // If we have the unified option, we can safely remove the redundant "Distribute to Stats".
            // If we DON'T have it (e.g. data difference), we must KEEP "Distribute to Stats".
            if (isRedundantDistribute && hasUnifiedDistribute) {
                logger.debug(`[Engine] Filtering out redundant Bard Level 12 option (Distribute): ${text}`);
                return false;
            }

            if (isChooseHeader || isStatEntry) {
                logger.debug(`[Engine] Filtering out redundant Bard Level 12 option: ${text}`);
                return false;
            }
        }

        // SPECIAL FILTER: Warlock Level 3-6 Table (xM3hghlK5nvo46Vo)
        // Consolidate all 3-6 results into a single "Distribute to Stats (Warlock)" item.
        if (table?._id === "xM3hghlK5nvo46Vo") {
            const range = r.range || [0, 0];
            // If we are in the 3-6 range, we want to replace this item with the synthetic header later.
            // But here we are filtering valid results.
            // If we return TRUE, it's kept.
            // We need to Detect if we are in this range.
            if (range[0] === 3 && range[1] === 6) {
                // We'll handle the synthesis in the functionalResults check below.
                return true;
            }
        }

        return text && !/^(or|and|choose\s+(?:one|1)|select\s+(?:one|1))$/i.test(text);
    });

    // Post-Filter Synthesis
    if (functionalResults.length > 0) {
        // Check for Warlock 3-6 case to synthesize the single option
        if (table?._id === "xM3hghlK5nvo46Vo") {
            const range3to6 = functionalResults.filter((r: any) => {
                const range = r.range || [0, 0];
                return range[0] === 3 && range[1] === 6;
            });

            if (range3to6.length > 0) {
                // We have results in the 3-6 range. 
                // We want to return a SINGLE synthetic item "Distribute to Stats (Warlock)".
                // Only if the roll didn't naturally land on such an item (which it won't, raw data is split).

                logger.info(`[Engine] Synthesizing Warlock Distribute option from ${range3to6.length} results.`);

                const syntheticItem = {
                    _id: "synthetic_warlock_distribute",
                    name: "Distribute to Stats (Warlock)",
                    text: "Distribute to Stats (Warlock)",
                    img: "icons/magic/symbols/question-stone-yellow.webp",
                    type: "Talent",
                    system: { level: 0 }, // Dummy
                    range: [3, 6]
                };

                // Replace the functional results with JUST this item (if the roll was in this range)
                // If the roll covered OTHER ranges too? (Unlikely for 2d6 table unless range overlaps).
                // Actually, matchedResults only contains items matching the roll.
                // So if we have ANY 3-6 items, we probably ONLY have 3-6 items (since ranges are exclusive).

                // So we can return a choice with just this item.
                // Actually, processRollResult returns { item, needsChoice, choiceOptions }.
                // If we have 1 item, needsChoice = false.

                return { item: syntheticItem, needsChoice: false, choiceOptions: [] };
            }
        }
        // Check for "or" in a single result to split it
        let splitOptions: any[] = [];
        if (functionalResults.length === 1) {
            const text = (functionalResults[0].text || functionalResults[0].name || "").trim();

            // EXCEPTION: Do not split specific known items that contain "or" in their name
            const noSplitItems = [
                "priest or wizard wand", // Bard Level 12
            ];
            const shouldSkipSplit = noSplitItems.some(item => text.toLowerCase().includes(item));

            if (!shouldSkipSplit && /\s+or\s+/i.test(text)) {
                logger.info(`[Engine] Splitting single "or" result into choices: ${text}`);
                const parts = text.split(/\s+or\s+/i);
                splitOptions = parts.map((p: string) => ({
                    ...functionalResults[0],
                    name: p.trim(),
                    text: p.trim()
                }));
            }
        }

        if (functionalResults.length > 1 || splitOptions.length > 1) {
            logger.info(`[Engine] Choice detected: ${functionalResults.length} items or ${splitOptions.length} splits.`);
            const options = splitOptions.length > 0 ? getChoices(table, splitOptions) : getChoices(table, matchedResults);

            if (options.length > 1) {
                needsChoice = true;
                choiceOptions = options;
                item = null; // Choice modal takes over
            } else if (options.length === 1) {
                // If filtering/deduplication left only one real item, use it directly
                const hydratedSource = splitOptions.length > 0 ? splitOptions[0] : matchedItems[0];
                item = hydratedSource || matchedItems[0];
            }
        }
    }

    // Strategy 2: Global Table Choice (e.g. "Choose 1 from the following")
    // If we haven't found a constrained choice, check if the single item is a header.
    if (!needsChoice && item) {
        const text = (item.text || item.name || item.description || "").toLowerCase();

        // Strict check for headers
        const isChoiceHeader = /^(?:choose|select)\s+(?:one|1|\d+)(?:\s+or\s+\d+)?$/i.test(text) ||
            /^(?:choose|select)\s+one$/i.test(text);

        if (isChoiceHeader) {
            // If it's a header, but we ONLY have this header in the results, 
            // then we unfortunately MUST fallback to the whole table or 
            // find items in the same range tier.
            needsChoice = true;
            choiceOptions = getChoices(table);
            item = null;
        } else if (/^(?:or|and)$/i.test(text)) {
            // Generic "OR" instruction result, offer whole table if no functional results were found
            needsChoice = true;
            choiceOptions = getChoices(table);
            item = null;
        } else {
            // It's a text result (instruction/flavor), NOT a choice header.
            if (!item.name && (item.text || item.description)) item.name = item.text || item.description;
        }
    }

    return { item, needsChoice, choiceOptions };
}

export function getChoices(table: any, sourceResults?: any[]): any[] {
    const results = sourceResults || (table && table.results) || [];
    if (results.length === 0) return [];

    logger.info(`[Engine] processing choices for ${table?.name || 'unknown'} (${results.length} results)`);

    // First map to potential options
    const rawOptions = results
        .filter((r: any) => {
            // Filter out the "OR" result itself if it's just a connector
            const name = (r.text || r.name || "").trim().toLowerCase();

            // Filter out "Choose 1" type headers and "Reroll/Already Taken" instructions from the OPTIONS list
            const instructionRegex = /(?:choose|select)\s+(?:one|1)|\s+or\s+|\breroll\b|\balready\s+taken\b|\balready\s+had\b/i;
            if (instructionRegex.test(name)) {
                logger.debug(`[Engine] Filtering out choice instruction: ${name}`);
                return false;
            }

            const keep = name && !/^(or|and|reroll)$/i.test(name) && !/^\d+$/.test(name);
            if (!keep) logger.debug(`[Engine] Filtering out choice option: ${name}`);
            return keep;
        })
        .map((r: any) => {
            const name = (r.text || r.name || r.description || "").trim();
            return {
                name: name || "Unknown Option",
                text: name || "Unknown Option",
                type: 'Talent',
                img: r.img || (table ? table.img : ""),
                uuid: r.documentUuid || r.uuid || r._id,
                original: r
            };
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

    // Sanitization
    return items.map(item => {
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
