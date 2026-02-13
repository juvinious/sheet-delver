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
    let item = result.items && result.items.length > 0 ? { ...result.items[0] } : null;
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

    if (item) {
        // Filter invalid item result immediately
        const itemName = (item.text || item.name || "").trim().toLowerCase();
        // Filter out "or", "and", empty string, or pure numbers if they are the ONLY result
        // But we want to keep them if we are going to offer a choice
        if (!itemName || /^(or|and)$/.test(itemName) || /^\\d+$/.test(itemName)) {
            logger.debug(`[Engine] Item name '${itemName}' matches invalid pattern. Checking choice potential...`);
            // We DO NOT set item to null here, we just flag it potential invalid
            // If needsChoice doesn't pick it up, it might be an issue.
        }
    }

    // Detect if choice is needed
    // 1. Text Item Check - Only IF it matches a choice pattern
    if (!needsChoice && item && (item.type === 'text' || item.type === 0)) {
        const text = (item.text || item.name || "").toLowerCase();
        // Strict check: Must imply a choice (Choose, Select, OR connectivity)
        const isChoiceHeader = /^(?:choose|select)\s+(?:one|1|\d+)(?:\s+or\s+\d+)?$/i.test(text) ||
            /(?:^|\s)or(?:$|\s)/i.test(text) ||
            text === 'choose 1' || text === 'select 1'; // explicit fallback

        if (isChoiceHeader) {
            needsChoice = true;
        } else {
            // It's a text result (instruction/flavor), NOT a choice header. 
            // Ensure it has a name for display
            if (!item.name && item.text) item.name = item.text;
        }
    }

    // 2. Result Text Check (Regex backup for non-text types that might rely on name/text)
    if (!needsChoice && item) {
        const text = (item.text || item.name || item.description || "").toLowerCase();
        // Allow "or" at start/end or surrounded by spaces. Matches "or", "1 or 2", "choose one", etc.
        const regex = /(?:choose|select)\s+(?:one|1)|(?:^|\s)or(?:$|\s)/i;
        if (regex.test(text)) {
            needsChoice = true;
        }
    }

    if (needsChoice && table && table.results) {
        choiceOptions = getChoices(table);
        // If we found valid options, and the current item is just an instruction (text), set item to null
        // so the frontend uses the header logic.
        if (choiceOptions.length > 1) {
            // Only clear item if it was a text instruction
            if (item.type === 'text' || item.type === 0) item = null;
        }
    }

    return { item, needsChoice, choiceOptions };
}

export function getChoices(table: any): any[] {
    if (!table || !table.results) return [];

    logger.info(`[Engine] processing choices for table ${table.name} (${table.results.length} results)`);

    // First map to potential options
    const rawOptions = table.results
        .filter((r: any) => {
            // Filter out the "OR" result itself if it's just a connector
            const name = (r.text || r.name || "").trim().toLowerCase();

            // Filter out "Choose 1" type headers from the OPTIONS list
            if (/choose\s+(?:one|1)|\s+or\s+/i.test(name)) {
                logger.debug(`[Engine] Filtering out choice header: ${name}`);
                return false;
            }

            const keep = name && !/^(or|and)$/.test(name) && !/^\d+$/.test(name);
            if (!keep) logger.debug(`[Engine] Filtering out choice option: ${name}`);
            return keep;
        })
        .map((r: any) => ({
            name: r.text || r.name,
            text: r.text || r.name,
            type: 'Talent',
            img: r.img || table.img,
            uuid: r.documentUuid || r.uuid || r._id,
            original: r
        }));

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
