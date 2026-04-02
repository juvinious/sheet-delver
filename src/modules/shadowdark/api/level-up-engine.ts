import { logger } from '../../../core/logger';
import { dataManager } from '../data/DataManager';
import { TALENT_HANDLERS } from './talent-handlers';
import { resolveBaggage, resolveGear } from './gear-resolver';
import { ROLL_TABLE_FILTER } from '../data/roll-table-patterns';
import { TableService } from '../utils/TableService';
import { sanitizeItems } from '../utils/Sanitizer';

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
            const extra = await handler.resolveItems(state, targetLevel, async (uuid: string) => {
                if (client) {
                    const { shadowdarkAdapter } = await import('../system');
                    return shadowdarkAdapter.resolveDocument(client, uuid);
                } else {
                    return dataManager.getDocument(uuid);
                }
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
                const { shadowdarkAdapter } = await import('../system');
                const resolved = await shadowdarkAdapter.resolveDocument(client, uuid);
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
    return sanitizeItems(resolvedItems);
}
