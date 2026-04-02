
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
    const gp = Number(coins.gp) || 0;
    const sp = Number(coins.sp) || 0;
    const cp = Number(coins.cp) || 0;

    // Total Value in GP: 100 CP = 10 SP = 1 GP
    const totalGP = gp + (sp / 10) + (cp / 100);

    // 10 GP = 1 Slot
    return Math.floor(totalGP / 10);
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
 * Calculates attack summaries (to-hit, damage) for an actor's weapons.
 */
export const calculateAttacks = (actor: any, items: any[]) => {
    const melee: any[] = [];
    const ranged: any[] = [];

    const stats = actor.computed?.abilities || actor.stats || {};
    const strMod = Number(stats.str?.mod || stats.STR?.mod || 0);
    const dexMod = Number(stats.dex?.mod || stats.DEX?.mod || 0);

    const weapons = items.filter(i => i.type === 'Weapon' && i.system?.equipped);

    for (const w of weapons) {
        const s = w.system || {};
        const isFinesse = (s.properties || []).some((p: string) => p.toLowerCase().includes('finesse'));
        const isThrown = (s.properties || []).some((p: string) => p.toLowerCase().includes('thrown'));
        const isRangedType = s.type === 'ranged';
        const attackBonus = Number(s.bonuses?.attackBonus || 0);
        const damageBonus = Number(s.bonuses?.damageBonus || 0);

        // Determine To-Hit
        let toHit = attackBonus;
        if (isRangedType) toHit += dexMod;
        else if (isFinesse) toHit += Math.max(strMod, dexMod);
        else toHit += strMod;

        const toHitStr = `${toHit >= 0 ? '+' : ''}${toHit}`;

        // Damage
        const dmgDie = s.damage?.melee || s.damage?.ranged || '1d4';
        let dmgMod = damageBonus;
        if (!isRangedType) dmgMod += strMod; // Strength adds to melee damage in SD
        
        const dmgStr = `${dmgDie}${dmgMod !== 0 ? (dmgMod > 0 ? '+' : '') + dmgMod : ''}`;

        const attackData = {
            id: w._id || w.id,
            name: w.name,
            img: w.img,
            toHit: toHitStr,
            damage: dmgStr,
            handedness: s.handedness || 'one-handed',
            properties: s.properties || []
        };

        if (isRangedType || isThrown) ranged.push(attackData);
        if (!isRangedType) melee.push(attackData);
    }

    return { melee, ranged };
};

/**
 * Calculates language selection limits based on class and ancestry.
 */
export const getLanguageLimits = (actor: any, systemData?: any) => {
    const items = actor.items || [];
    const findItem = (type: string) => items.find((i: any) => (i.type || "").toLowerCase() === type.toLowerCase());

    const classObj = findItem('class');
    const ancestryObj = findItem('ancestry');
    const backgroundObj = findItem('background');

    const cl = classObj?.system?.languages || {};
    const al = ancestryObj?.system?.languages || {};
    const bl = backgroundObj?.system?.languages || {};

    const baseCommon = (Number(cl.common) || 0) + (Number(al.common) || 0) + (Number(bl.common) || 0) +
                       (Number(cl.select) || 0) + (Number(al.select) || 0) + (Number(bl.select) || 0);

    const baseRare = (Number(cl.rare) || 0) + (Number(al.rare) || 0) + (Number(bl.rare) || 0);

    // Count fixed languages if we have access to systemData to check rarity
    let fixedCommon = 0;
    let fixedRare = 0;

    if (systemData?.languages) {
        const allFixed = Array.from(new Set([
            ...(cl.fixed || []),
            ...(al.fixed || []),
            ...(bl.fixed || [])
        ]));

        for (const f of allFixed) {
            const lang = systemData.languages.find((l: any) => l.name === f || l.uuid === f);
            if (lang?.rarity === 'rare') {
                fixedRare++;
            } else {
                fixedCommon++;
            }
        }
    }

    return {
        maxCommon: baseCommon + fixedCommon,
        maxRare: baseRare + fixedRare
    };
};


/**
 * Unified Spellcaster Logic for Shadowdark
 */

export const getSpellcastingClass = (item: any): string => {
    if (!item || item.type !== 'Class') return '';

    const system = item.system || {};
    const spellcasting = system.spellcasting || {};
    const explicitClass = (spellcasting.class || '').toLowerCase().trim();

    if (explicitClass && explicitClass !== 'none' && explicitClass !== '__not_spellcaster__') {
        return explicitClass;
    }

    // Heuristic: If they have spellcasting ability AND spellsknown table, they are a caster
    const hasTable = spellcasting.spellsknown && Object.keys(spellcasting.spellsknown).length > 0;
    const hasAbility = !!spellcasting.ability;

    if (hasTable || hasAbility) {
        return (item.name || '').toLowerCase().trim();
    }

    return '';
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
    const items = actor.items?.contents || (Array.isArray(actor.items) ? actor.items : []);

    // 1. Check for Class with explicit spellcasting metadata
    if (items.some((i: any) => 
        (i.type || "").toLowerCase() === 'class' && 
        (i.system?.spellcasting?.ability || i.system?.spellcasting?.base)
    )) return true;

    if (isInnateCaster(actor)) return true;

    // 2. Check for explicit Spell items
    if (items.some((i: any) => (i.type || "").toLowerCase() === 'spell')) return true;

    // 3. Check for Spellcasting Talents/Boons (Broad detection)
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

/**
 * Unified Normalization Logic for Shadowdark
 */

/**
 * Normalizes an item document with Shadowdark-specific properties (slots, light sources, etc.)
 */
export const normalizeItemData = (item: any, baseUrl?: string) => {
    if (!item) return null;

    // Helper for URL resolution
    const resolveUrl = (url: string) => {
        if (!url) return url;
        if (url.startsWith('http') || url.startsWith('https') || url.startsWith('data:')) return url;
        if (!baseUrl) return url;
        const cleanPath = url.startsWith('/') ? url.slice(1) : url;
        const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBase}/${cleanPath}`;
    };

    const itemData: any = {
        id: item._id || item.id,
        name: item.name,
        type: item.type,
        img: resolveUrl(item.img),
        system: (typeof item.system?.toObject === 'function' ? item.system.toObject() : item.system) || {},
        uuid: item.uuid || (item._id ? `Item.${item._id}` : undefined),
        effects: item.effects ? Array.from(item.effects).map((e: any) => ({
            _id: e.id || e._id,
            name: e.name || e.label,
            changes: e.changes,
            disabled: e.disabled,
            icon: e.icon || e.img
        })) : []
    };

    // Calculate slot usage for physical items
    if (itemData.system?.slots && itemData.type !== "Gem") {
        itemData.slotsUsed = calculateItemSlots(itemData);
        itemData.showQuantity = (Number(itemData.system.slots.per_slot) > 1) || (Number(itemData.system.quantity) > 1);
    }

    // Light source progress indicators
    if (itemData.system?.light?.isSource) {
        itemData.isLightSource = true;
        itemData.lightSourceActive = itemData.system.light.active;
        itemData.lightSourceUsed = itemData.system.light.hasBeenUsed;

        const maxSeconds = (Number(itemData.system.light.longevityMins) || 0) * 60;
        let progress = "◆";
        for (let x = 1; x < 4; x++) {
            if (Number(itemData.system.light.remainingSecs) > (maxSeconds * x / 4)) {
                progress += " ◆";
            } else {
                progress += " ◇";
            }
        }
        itemData.lightSourceProgress = progress;

        const timeRemaining = Math.ceil(Number(itemData.system.light.remainingSecs) / 60);
        if (Number(itemData.system.light.remainingSecs) < 60) {
            itemData.lightSourceTimeRemaining = "< 1 min";
        } else {
            itemData.lightSourceTimeRemaining = `${timeRemaining} min`;
        }
    }

    return itemData;
};

/**
 * Normalizes an actor document and computes all derived Shadowdark stats.
 * This is the single source of truth for both client and server.
 */
export const normalizeActorData = (actor: any, items: any[] = [], systemData: any = null) => {
    const s = actor.system || {};
    const computed = { ...(actor.computed || {}) };

    // 1. Initial Ability Scores (Base + Bonus)
    let stats = calculateAbilities(s);

    // 2. Apply Effects (Active Bonuses)
    // Create a working shadow of system data to apply effects to
    const effectApplied = JSON.parse(JSON.stringify(s));
    const allEffects = items.reduce((acc, i) => {
        if (i.effects) acc.push(...i.effects);
        return acc;
    }, []);
    
    // Also include actor's own effects
    const actorEffects = actor.effects?.contents || (Array.isArray(actor.effects) ? actor.effects : []);
    allEffects.push(...actorEffects);

    applyEffects(effectApplied, allEffects);

    // Re-calculate abilities after effects
    stats = calculateAbilities(effectApplied);
    computed.abilities = stats;

    // 3. Derived Stats
    const actorProxy = { ...actor, system: effectApplied, items, computed };
    computed.ac = calculateAC(actorProxy, items);
    computed.maxSlots = calculateMaxSlots(actorProxy);
    
    // 4. Slot Calculation
    let usedSlots = 0;
    items.forEach((i: any) => {
        if (!i.system?.stashed && i.type !== 'Gem') {
            usedSlots += calculateItemSlots(i);
        }
    });
    usedSlots += calculateGemSlots(items.filter((i: any) => i.type === 'Gem' && !i.system?.stashed));
    usedSlots += calculateCoinSlots(effectApplied.coins);
    
    computed.slotsUsed = Math.max(0, usedSlots);
    computed.gearSlots = computed.maxSlots; // Compatibility mapping

    // 5. XP & Leveling
    const levelVal = Number(effectApplied.level?.value) || 0;
    const xpVal = Number(effectApplied.level?.xp) || 0;
    const nextXP = Number(effectApplied.level?.xp_max) || (Math.max(1, levelVal) * 10);
    computed.xpNextLevel = nextXP;
    computed.levelUp = xpVal >= nextXP && nextXP > 0;

    // 6. Character Status Flags
    computed.isSpellcaster = isSpellcaster(actorProxy);
    computed.canUseMagicItems = canUseMagicItems(actorProxy);
    computed.showSpellsTab = shouldShowSpellsTab(actorProxy);

    // 7. Attacks & Combat
    computed.attacks = calculateAttacks(actorProxy, items);

    // 8. Inventory Categorization (for UI components)
    // Exclude non-physical items like Spells, Talents, etc.
    const physicalItems = items.filter(i => 
        !['Talent', 'Spell', 'Effect', 'Class', 'Ancestry', 'Background', 'Deity', 'Title', 'Language', 'Patron', 'Gem', 'Boon'].includes(i.type)
    );

    const eq = physicalItems.filter(i => i.system?.equipped);
    const st = physicalItems.filter(i => i.system?.stashed);
    const cr = physicalItems.filter(i => !i.system?.equipped && !i.system?.stashed);
    computed.inventory = { equipped: eq, stashed: st, carried: cr };

    // 9. Language Limits
    computed.languageLimits = getLanguageLimits(actorProxy, systemData);

    // 9. Find Key Items (Class, Ancestry, etc.)
    const lowerType = (i: any) => (i.type || "").toLowerCase();
    computed.classDetails = items.find((i: any) => lowerType(i) === 'class');
    computed.ancestryDetails = items.find((i: any) => lowerType(i) === 'ancestry');
    computed.backgroundDetails = items.find((i: any) => lowerType(i) === 'background');
    computed.patronDetails = items.find((i: any) => lowerType(i) === 'patron');

    return computed;
};
