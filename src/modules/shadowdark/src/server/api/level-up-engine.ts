import { logger } from '@shared/utils/logger';
import { shadowdarkAdapter } from '../../server/ShadowdarkAdapter';
import { TALENT_HANDLERS } from '../../logic/talent-handlers';
import { resolveBaggage, resolveGear } from './gear-resolver';
import { ROLL_TABLE_FILTER } from '../../data/roll-table-patterns';
import { TableService } from '../../utils/TableService';
import { sanitizeItems } from '../../utils/Sanitizer';

interface RollResultProcessorOptions {
    result: any;
    table: any;
    client?: any;
}

export async function processRollResult({ result, table, client }: RollResultProcessorOptions) {
    return await TableService.processRollResult(client, { result, table });
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
            choiceRolls = 0;
            requiredTalents = 0;
        } else if (isOddLevel) {
            choiceRolls = 1;
            requiredBoons = 0;
            requiredTalents = 0;
        } else {
            requiredTalents = 0;
            requiredBoons = 0;
            choiceRolls = 0;
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
export async function assembleFinalItems(state: LevelUpState, targetLevel: number, classObj: any, ancestry?: any, background?: any, patron?: any, client?: any) {
    const items: any[] = [];
    const baggageUuids = new Set<string>();

    // 1. Process Talents and Boons
    const allRolled = [...state.rolledTalents, ...state.rolledBoons];
    const rolledUuids = new Set(allRolled.map(i => i.uuid || i.documentUuid).filter(Boolean));
    const displacedUuids = new Set<string>();

    for (const rawItem of allRolled) {
        const item = { ...rawItem };
        
        // Ensure level is set for table-rolled talents
        if (!item.system) item.system = {};
        if (typeof item.system.level === 'undefined' || item.system.level === null) {
            item.system.level = targetLevel;
        }

        // Apply mutations from handlers ONLY if they are active selections
        for (const handler of TALENT_HANDLERS) {
            if (handler.matches(item)) {
                // If handler will resolve separate items, mark this one for displacement
                if (handler.resolveItems) {
                    const uuid = item.uuid || item.documentUuid;
                    if (uuid) displacedUuids.add(uuid);
                }

                if (handler.mutateItem) {
                    const isSelection = (handler.action === 'stat-selection' && state.statSelection) ||
                                      (handler.action === 'stat-pool' && state.statPool) ||
                                      (handler.action === 'extra-spell' && state.extraSpellSelection);
                    
                    if (isSelection || !handler.action) {
                        handler.mutateItem(item, state);
                    }
                }
            }
        }
        items.push(item);
    }

    // 2. Resolve additional items from handlers
    for (const handler of TALENT_HANDLERS) {
        if (handler.resolveItems) {
            const extra = await handler.resolveItems(state, targetLevel, async (uuid: string) => {
                return shadowdarkAdapter.resolveDocument(client, uuid);
            });
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
            classAbilities.forEach(i => { if (i.uuid) baggageUuids.add(i.uuid); });
            items.push(...classAbilities);
        }
        if (ancestry) {
            const ancestryBaggage = await resolveGear(ancestry, client);
            items.push(...ancestryBaggage);

            const ancestryAbilities = await resolveBaggage(ancestry, client);
            ancestryAbilities.forEach(i => { if (i.uuid) baggageUuids.add(i.uuid); });
            items.push(...ancestryAbilities);
        }
        if (background) {
            const bgAbilities = await resolveBaggage(background, client);
            bgAbilities.forEach(i => { if (i.uuid) baggageUuids.add(i.uuid); });
            items.push(...bgAbilities);
        }
        if (patron) {
            const patronAbilities = await resolveBaggage(patron, client);
            patronAbilities.forEach(i => { if (i.uuid) baggageUuids.add(i.uuid); });
            items.push(...patronAbilities);
        }
    }

    // 5. Final pass (Resolution & Categorization)
    const resolvedItems: any[] = [];
    const seenUuids = new Set<string>();
    const baggageNames = new Set(
        items
            .filter(i => !allRolled.some(r => (r.uuid || r.documentUuid) === (i.uuid || i.documentUuid)))
            .map(i => (i.name || "").trim().toLowerCase())
            .filter(Boolean)
    );

    for (const item of items) {
        const uuid = item.documentUuid || item.uuid || item._id;
        const name = (item.name || "").trim().toLowerCase();

        // DISPLACEMENT CHECK: Skip if this item was displaced by a handler
        if (uuid && displacedUuids.has(uuid)) {
            continue;
        }

        // UUID DEDUPLICATION: Skip if we've already resolved this exact UUID
        if (uuid && seenUuids.has(uuid)) {
            continue;
        }

        // NAME-BASED DEDUPLICATION: 
        // If this is a ROLLED talent and it matches a BAGGAGE name, skip IF it's not a stacker
        const isRolled = allRolled.some(r => (r.uuid || r.documentUuid) === uuid);
        if (isRolled && baggageNames.has(name)) {
            // Check if it's a known stacking candidate
            const isStacker = name.startsWith("+1") || name.startsWith("+2") || name.includes("improvement");
            if (!isStacker) {
                logger.info(`[LevelUpEngine] Deduplicating rolled talent matching baggage: ${item.name}`);
                continue;
            }
        }

        if (uuid) seenUuids.add(uuid);

        let clean = { ...item };
        const type = String(item.type || "");
        const isShallow = !item.system || Object.keys(item.system).length === 0;
        const needsResolution = (type === 'document' || type === '2' || isShallow) && uuid;

        if (needsResolution) {
            try {
                const doc = await shadowdarkAdapter.resolveDocument(client, uuid!);
                if (doc) {
                    clean = { ...doc };
                    delete clean._id;
                    clean.uuid = uuid!;
                    
                    // Metadata pass: ensure talentClass and talentLevel are preserved if they were on the 'stub'
                    if (item.system?.talentClass && !clean.system?.talentClass) {
                        if (!clean.system) clean.system = {};
                        clean.system.talentClass = item.system.talentClass;
                    }
                    if (item.system?.level && !clean.system?.level) {
                        if (!clean.system) clean.system = {};
                        clean.system.level = item.system.level;
                    }

                    // Apply mutations again to the resolved document
                    for (const handler of TALENT_HANDLERS) {
                        if (handler.matches(clean) && handler.mutateItem) {
                             const isSelection = (handler.action === 'stat-selection' && state.statSelection) ||
                                               (handler.action === 'stat-pool' && state.statPool) ||
                                               (handler.action === 'extra-spell' && state.extraSpellSelection);
                            
                            if (isSelection || !handler.action) {
                                handler.mutateItem(clean, state);
                            }
                        }
                    }
                }
            } catch (e) {
                logger.error(`[LevelUpEngine] Failed to resolve ${uuid}:`, e);
            }
        }

        // TAGGING: Tag advancements as 'level' if they lack a class to avoid being lost
        if (rolledUuids.has(uuid || "") && !baggageUuids.has(uuid || "") && !clean.system?.talentClass) {
            if (!clean.system) clean.system = {};
            clean.system.talentClass = "level";
        }

        resolvedItems.push(clean);
    }

    return sanitizeItems(resolvedItems);
}
