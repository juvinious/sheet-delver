
export const calculateItemSlots = (item: any) => {
    const s = item.system?.slots;
    if (!s) return 0;

    // Handle simple number case
    if (typeof s !== 'object') {
        return Number(s) * (Number(item.system?.quantity) || 1);
    }

    const quantity = Number(item.system?.quantity) || 0;
    const perSlot = Number(s.per_slot) || 1;
    const slotsUsed = Number(s.slots_used) || 0;
    const freeCarry = Number(s.free_carry) || 0;

    const rawCost = Math.ceil(quantity / perSlot) * slotsUsed;
    return Math.max(0, rawCost - freeCarry);
};

export const calculateMaxSlots = (actor: any) => {
    // 1. Base slots = Max(10, STR Score)
    // Try to get score from various paths
    const strObj = actor.system?.abilities?.str || actor.system?.abilities?.STR || actor.stats?.str || actor.stats?.STR || actor.attributes?.str || actor.attributes?.STR;

    // In normalized data (adapter), we might have { val, mod } or just { mod }.
    // Detailed raw actor has system.abilities.str.value.

    // Safest bet: Look for 'value' or 'base' or try to parse the object itself if it is a number.
    const strScore = Number(strObj?.value ?? strObj?.base ?? 10);
    const base = Math.max(10, strScore);

    // 2. Hauler Talent: Add CON mod slots
    const hauler = (actor.items || []).find((i: any) => i.type === 'Talent' && i.name.toLowerCase() === 'hauler');
    let bonus = 0;
    if (hauler) {
        const conObj = actor.system?.abilities?.con || actor.system?.abilities?.CON || actor.stats?.con || actor.stats?.CON || actor.attributes?.con || actor.attributes?.CON;
        bonus = Number(conObj?.mod) || 0;
    }

    // 3. Effects: Add bonuses from system.bonuses.gearSlots
    const effectBonus = Number(actor.system?.bonuses?.gearSlots) || 0;

    return base + bonus + effectBonus;
};

export const calculateCoinSlots = (coins: any) => {
    if (!coins) return 0;
    const total = (Number(coins.gp) || 0) + (Number(coins.sp) || 0) + (Number(coins.cp) || 0);
    return Math.floor(total / 100);
};

export const calculateGemSlots = (gems: any[]) => {
    if (!gems || gems.length === 0) return 0;
    const total = gems.reduce((acc, g) => acc + (Number(g.system?.quantity) || 1), 0);
    return Math.floor(total / 10);
};

export const calculateAC = (actor: any, items: any[]) => {
    // 1. Base AC = 10 + Dex Mod
    const abilities = actor.system?.abilities || {};
    const dex = abilities.dex || abilities.DEX || { mod: 0 };
    let base = 10 + (Number(dex.mod) || 0);

    // 2. Armor Bonus
    const armor = items.filter((i: any) => i.type === 'Armor' && i.system?.equipped);
    for (const a of armor) {
        // Shadowdark armor replaces base AC usually, or adds to it?
        // Rules: Leather (AC 11 + Dex), Chain (AC 13 + Dex), Plate (AC 15, No Dex).
        // Shield (+2).

        // We need to know the Armor properties.
        // Assuming system.ac.value or similar.
        const acVal = Number(a.system?.ac?.value) || 0;
        const acBase = Number(a.system?.ac?.base) || 0;

        // If it's a Shield, it adds.
        const isShield = a.system?.isShield || a.name.toLowerCase().includes('shield');

        if (isShield) {
            base += (acBase || acVal); // Usually +2
        } else {
            // Main Armor.
            // Check if it allows Dex.
            // Simplified: If AC > 10, it sets the base.
            // Plate (15) doesn't use Dex.
            // Leather (11) uses Dex.

            // We need to emulate Foundry system logic or standard rules.
            // Standard:
            // Leather: 11 + Dex
            // Chain: 13 + Dex
            // Plate: 15 (No Dex)

            // If item has `system.ac.base`, we use that.
            if (acBase > 0) {
                // Check property "noDex" or similar?
                const propertyArr = a.system?.properties || [];
                const noDex = propertyArr.includes('noDex') || acBase >= 15; // Heuristic

                if (noDex) {
                    base = acBase; // Reset base, ignore Dex (wait, base included Dex before)
                    // Re-calc: base = acBase
                    // If shield was added, we need to preserve it?
                    // Better: Set `armorBase` and `shieldBonus`.
                } else {
                    base = acBase + (Number(dex.mod) || 0);
                }
            }
        }
    }

    // If multiple armors equipped, usually highest counts.
    // Simplifying: The user should define this properly.
    // For now, let's trust `actor.system.attributes.ac.value` if available, otherwise 10.
    // But we are porting LOGIC.

    return base;
};

export const applyEffects = (systemData: any, effects: any[]) => {
    // Ported from system.ts
    const MODES = { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };

    // Helper to get nested property
    const getProperty = (obj: any, path: string) => {
        return path.split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
    };

    // Helper to set nested property
    const setProperty = (obj: any, path: string, value: any) => {
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    };

    for (const effect of effects) {
        if (effect.disabled) continue;

        const changes = effect.changes || [];
        for (const change of changes) {
            const { key, value, mode } = change;
            if (!key) continue;

            let path = key;
            if (path.startsWith('system.')) path = path.substring(7);

            // Shorthands
            const SHORTHANDS: Record<string, string> = {
                'str.bonus': 'abilities.str.bonus',
                'dex.bonus': 'abilities.dex.bonus',
                'con.bonus': 'abilities.con.bonus',
                'int.bonus': 'abilities.int.bonus',
                'wis.bonus': 'abilities.wis.bonus',
                'cha.bonus': 'abilities.cha.bonus',
                'hp.max': 'attributes.hp.max',
                'hp.bonus': 'attributes.hp.bonus'
            };
            if (SHORTHANDS[path]) path = SHORTHANDS[path];

            const currentVal = Number(getProperty(systemData, path)) || 0;
            const changeVal = Number(value) || 0;

            if (isNaN(changeVal) && mode !== MODES.OVERRIDE) continue;

            let finalVal = currentVal;
            switch (Number(mode)) {
                case MODES.ADD: finalVal = currentVal + changeVal; break;
                case MODES.MULTIPLY: finalVal = currentVal * changeVal; break;
                case MODES.OVERRIDE: finalVal = isNaN(changeVal) ? value : changeVal; break;
                case MODES.UPGRADE: finalVal = Math.max(currentVal, changeVal); break;
                case MODES.DOWNGRADE: finalVal = Math.min(currentVal, changeVal); break;
            }
            setProperty(systemData, path, finalVal);
        }
    }
};

export const calculateAbilities = (systemData: any) => {
    const abilities: any = systemData.abilities || {};
    const res: any = {};

    for (const key of Object.keys(abilities)) {
        const stat = abilities[key];
        const val = Number(stat.value) || (Number(stat.base) + Number(stat.bonus)) || 10;
        const mod = Math.floor((val - 10) / 2);
        res[key] = { ...stat, value: val, mod };
    }
    return res;
};

/**
 * Unified Spellcaster Logic for Shadowdark
 */

export const getSpellcastingClass = (item: any): string => {
    return (item?.system?.spellcasting?.class || '').toLowerCase().trim();
};

export const isClassSpellcaster = (classItem: any): boolean => {
    const spellClass = getSpellcastingClass(classItem);
    return spellClass.length > 0 && spellClass !== 'none' && spellClass !== '__not_spellcaster__';
};

export const getActorSpellcastingClass = (actor: any): string => {
    const items = actor.items?.contents || (Array.isArray(actor.items) ? actor.items : []);
    const classItem = items.find((i: any) => i.type === 'Class');
    return getSpellcastingClass(classItem);
};

export const isInnateCaster = (actor: any): boolean => {
    const spellClass = getActorSpellcastingClass(actor);
    // Explicitly check for valid class name (foundry uses __not_spellcaster__ for non-casters)
    return spellClass.length > 0 && spellClass !== 'none' && spellClass !== '__not_spellcaster__';
};

export const isSpellcaster = (actor: any): boolean => {
    if (isInnateCaster(actor)) return true;

    const items = actor.items?.contents || (Array.isArray(actor.items) ? actor.items : []);

    // Check for explicit Spell items
    if (items.some((i: any) => (i.type || "").toLowerCase() === 'spell')) return true;

    // Check for Spellcasting Talents/Boons (Broad detection)
    if (items.some((i: any) => {
        if (i.type !== 'Talent' && i.type !== 'Boon') return false;
        const name = (i.name || "").toLowerCase();
        // Match "Spellcasting", "Cast a Spell", "Learn Wizard Spell", etc.
        return name.includes('spellcast') || (name.includes('learn') && name.includes('spell'));
    })) return true;

    return false;
};

export const canUseMagicItems = (actor: any): boolean => {
    const items = actor.items?.contents || (Array.isArray(actor.items) ? actor.items : []);
    return items.some((i: any) => {
        const type = (i.type || "").toLowerCase();
        const name = (i.name || "").toLowerCase();
        return type === 'scroll' || type === 'wand' || name.includes('scroll') || name.includes('wand');
    });
};

export const shouldShowSpellsTab = (actor: any): boolean => {
    // Show if they are a caster OR have magic items they can use
    return isSpellcaster(actor) || canUseMagicItems(actor);
};
