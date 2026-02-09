
export interface PredefinedEffect {
    name: string;
    uuid: string;
}

// TODO: Create tooling to generate custom effects (e.g. valid Item structure) from a schema
// so we can fallback to creating them if a UUID isn't found or for custom homebrew effects.

// Map of descriptive keys to Shadowdark Compendium UUIDs
// Keys are derived from filenames/concepts for easier lookup
export const TALENT_EFFECTS_MAP: Record<string, string> = {
    // Stat Improvements
    '+1 Strength': 'Compendium.shadowdark.talents.IDGFaxKnYJWWuWQ7',
    '+1 Dexterity': 'Compendium.shadowdark.talents.eJHwfYQZ9LmLQeSn',
    '+1 Constitution': 'Compendium.shadowdark.talents.8SXPsiWvG2UcXGgW',
    '+1 Intelligence': 'Compendium.shadowdark.talents.LDJCx5syOcenLMZf',
    '+1 Wisdom': 'Compendium.shadowdark.talents.vRW8GSIKWXyOAKbw',
    '+1 Charisma': 'Compendium.shadowdark.talents.5INkcbMVFxK6cW5Z',

    '+2 Strength': 'Compendium.shadowdark.talents.6t06nSjj1hd6o5SV',
    '+2 Dexterity': 'Compendium.shadowdark.talents.vIbwotCa1eqCVZMU',
    '+2 Constitution': 'Compendium.shadowdark.talents.ZfaFn8TDum3NXYZN',
    '+2 Intelligence': 'Compendium.shadowdark.talents.aRY0hjpvzYpdRbfR',
    '+2 Wisdom': 'Compendium.shadowdark.talents.excvhYcpm1qd09IV',
    '+2 Charisma': 'Compendium.shadowdark.talents.UE2xABVKD0oCDtdx',

    // Combat Bonuses
    '+1 Melee Attacks': 'Compendium.shadowdark.talents.93QoQQ6cI7xa4TCm',
    '+1 Melee Damage': 'Compendium.shadowdark.talents.S4zOvXqPlLLNmGKl',
    '+1 Ranged Attacks': 'Compendium.shadowdark.talents.Y3Ytsye5zrP43w70',
    '+1 Ranged Damage': 'Compendium.shadowdark.talents.lodEOfzuI5jDWc4h', // Computed guess from name
    '+1 Melee and Ranged Attacks': 'Compendium.shadowdark.talents.WSm6JESNoyFBnkW2',
    'Advantage on Melee Attacks': 'Compendium.shadowdark.talents.6iJ6ETUAKC7DR0aT',
    'Backstab +1 Dice': 'Compendium.shadowdark.talents.HzzgAIdhoAyfeItJ',
    'Backstab': 'Compendium.shadowdark.talents.KLDZKFY6SrqQKSva',
    'Armor Mastery': 'Compendium.shadowdark.talents.0g9MUhj9Tr3AWRXl',
    'Shield Wall': 'Compendium.shadowdark.talents.KMMpRWDsIybiDW7u',
    'Weapon Mastery': 'Compendium.shadowdark.talents.5bpWuaT0KTNzuzCu',
    'Grit (Strength)': 'Compendium.shadowdark.talents.F0NXUJcnBOYKzhMi',
    'Grit (Dexterity)': 'Compendium.shadowdark.talents.DGZqkVUtcmxejdm1',

    // Spellcasting
    '+1 Spellcasting Checks': 'Compendium.shadowdark.talents.0WmG5j0Wv685YTqO', // _1_on_spellcasting_checks
    'Spellcasting Advantage': 'Compendium.shadowdark.talents.IZZnFjWhZurAIZPP',
    'Magic Resistance': 'Compendium.shadowdark.talents.52dWOJ8zzxCwfM1B',
    'Magical Dabbler': 'Compendium.shadowdark.talents.Om7QWre7U4Tbh84B',
    'Learn Extra Spell': 'Compendium.shadowdark.talents.Ey3P0EplF5SHIdey',
    'Wizard Spellcasting': 'Compendium.shadowdark.talents.Td6iQW4hVJLZLVLi',
    'Priest Spellcasting': 'Compendium.shadowdark.talents.EYRxfb5BUEzH1w3b',
    'Seer Spellcasting': 'Compendium.shadowdark.talents.Qu0KqU3KzzRS1oer',
    'Witch Spellcasting': 'Compendium.shadowdark.talents.7XtnCM9VdxVmh6D3',

    // HP & Misc
    'Additional HP': 'Compendium.shadowdark.talents.Z7og9OPv8PKFuWmQ',
    'HP Advantage': 'Compendium.shadowdark.talents.0rcSjPSjHdvGwtOu',
    'Stout': 'Compendium.shadowdark.talents.MW43tnJr6lqE1Ty8',
    '+1 AC': 'Compendium.shadowdark.talents.aFltU1eRz4bmIlbj',

    // Thief/Class Specific
    'Thievery': 'Compendium.shadowdark.talents.TiaXUSTLoJpjfyxD',
    'Stealthy': 'Compendium.shadowdark.talents.zkOiprnKS5uttiO6',
    'Ambush': 'Compendium.shadowdark.talents.pOuKrF2CMkxt7EQG', // trained_assassin

    // Generic Ability Improvements (likely from Boons or other sources)
    'Ability Score Improvement (Str)': 'Compendium.shadowdark.talents.IDGFaxKnYJWWuWQ7',
    'Ability Score Improvement (Dex)': 'Compendium.shadowdark.talents.eJHwfYQZ9LmLQeSn',
    'Ability Score Improvement (Con)': 'Compendium.shadowdark.talents.8SXPsiWvG2UcXGgW',
    'Ability Score Improvement (Int)': 'Compendium.shadowdark.talents.LDJCx5syOcenLMZf',
    'Ability Score Improvement (Wis)': 'Compendium.shadowdark.talents.vRW8GSIKWXyOAKbw',
    'Ability Score Improvement (Cha)': 'Compendium.shadowdark.talents.5INkcbMVFxK6cW5Z',
};

// Helper to find partial matches
export const findEffectUuid = (text: string): string | null => {
    const normalized = text.toLowerCase();
    for (const [key, uuid] of Object.entries(TALENT_EFFECTS_MAP)) {
        if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
            return uuid;
        }
    }
    return null;
};

// Mapping of System Predefined Keys to their configuration (transcoded from system/config.mjs)
// Mapping of System Predefined Keys to their configuration (transcoded from system/config.mjs)
export const SYSTEM_PREDEFINED_EFFECTS: Record<string, { label: string, key?: string, mode?: number, value?: string | number, icon: string, changes?: any[] }> = {
    // --- Stat Improvements (Explicit Checks) ---
    statBonusCha1: { label: '+1 to Charisma', key: "system.abilities.cha.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusCon1: { label: '+1 to Constitution', key: "system.abilities.con.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusDex1: { label: '+1 to Dexterity', key: "system.abilities.dex.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusInt1: { label: '+1 to Intelligence', key: "system.abilities.int.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusStr1: { label: '+1 to Strength', key: "system.abilities.str.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusWis1: { label: '+1 to Wisdom', key: "system.abilities.wis.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },

    statBonusCha2: { label: '+2 to Charisma', key: "system.abilities.cha.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusCon2: { label: '+2 to Constitution', key: "system.abilities.con.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusDex2: { label: '+2 to Dexterity', key: "system.abilities.dex.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusInt2: { label: '+2 to Intelligence', key: "system.abilities.int.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusStr2: { label: '+2 to Strength', key: "system.abilities.str.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    statBonusWis2: { label: '+2 to Wisdom', key: "system.abilities.wis.bonus", mode: 2, value: 2, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },

    // --- Complex Talents (Quickstart/Ancestry) ---
    mighty: {
        label: 'Mighty',
        icon: "icons/skills/melee/unarmed-punch-fist.webp",
        changes: [
            { key: "system.bonuses.meleeAttackBonus", mode: 2, value: 1 },
            { key: "system.bonuses.meleeDamageBonus", mode: 2, value: 1 }
        ]
    },
    stout: { label: 'Stout', key: "system.bonuses.advantage", mode: 2, value: "hp", icon: "icons/equipment/back/backpack-leather-tan.webp" },
    hauler: { label: 'Hauler', key: "system.bonuses.gearSlots", mode: 2, value: 3, icon: "icons/equipment/back/backpack-leather-tan.webp" },

    // --- Combat Bonuses (Explicit) ---
    meleeAttackBonus1: { label: '+1 to Melee Attacks', key: "system.bonuses.meleeAttackBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-polearm-glowing-white.webp" },
    meleeDamageBonus1: { label: '+1 to Melee Damage', key: "system.bonuses.meleeDamageBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    rangedAttackBonus1: { label: '+1 to Ranged Attacks', key: "system.bonuses.rangedAttackBonus", mode: 2, value: 1, icon: "icons/weapons/ammunition/arrow-head-war-flight.webp" },
    rangedDamageBonus1: { label: '+1 to Ranged Damage', key: "system.bonuses.rangedDamageBonus", mode: 2, value: 1, icon: "icons/weapons/ammunition/arrow-head-war-flight.webp" },

    meleeRangedAttackBonus: { label: '+1 to Melee and Ranged Attacks', key: "system.bonuses.attackBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-polearm-glowing-white.webp" },
    meleeRangedDamageBonus: { label: '+1 to Melee and Ranged Damage', key: "system.bonuses.damageBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-axe-blood-red.webp" },

    meleeAttackDamageBonus: {
        label: '+1 to Melee Attacks and Damage',
        icon: "icons/skills/melee/strike-polearm-glowing-white.webp",
        changes: [
            { key: "system.bonuses.meleeAttackBonus", mode: 2, value: 1 },
            { key: "system.bonuses.meleeDamageBonus", mode: 2, value: 1 }
        ]
    },
    rangedAttackDamageBonus: {
        label: '+1 to Ranged Attacks and Damage',
        icon: "icons/skills/melee/strike-polearm-glowing-white.webp",
        changes: [
            { key: "system.bonuses.rangedAttackBonus", mode: 2, value: 1 },
            { key: "system.bonuses.rangedDamageBonus", mode: 2, value: 1 }
        ]
    },
    weaponAttackDamageBonus: {
        label: '+1 to Weapon Attacks and Damage',
        icon: "icons/skills/melee/strike-polearm-glowing-white.webp",
        changes: [
            { key: "system.bonuses.attackBonus", mode: 2, value: 1 },
            { key: "system.bonuses.damageBonus", mode: 2, value: 1 }
        ]
    },

    dualWieldAc: { label: '+1 AC Dual Wield', key: "system.bonuses.acBonus", mode: 2, value: 1, icon: "icons/skills/melee/shield-block-gray-orange.webp" },

    // --- Spellcasting ---
    spellChecks1: { label: '+1 on Spellcasting Checks', key: "system.bonuses.spellcastingCheckBonus", mode: 2, value: 1, icon: "icons/magic/fire/flame-burning-fist-strike.webp" },
    magicMissileAdv: { label: 'Magic Missile Advantage', key: "system.bonuses.advantage", mode: 2, value: "Magic Missile", icon: "icons/magic/control/energy-stream-purple.webp" },
    farsightSpell: { label: 'Farsight (Spell)', key: "system.bonuses.advantage", mode: 2, value: "Farsight", icon: "icons/magic/light/beam-rays-yellow-blue-small.webp" }, // Guessing advantage or increased range? usually advantage to cast or effect?
    farsightRanged: { label: 'Farsight (Ranged)', key: "system.bonuses.rangedAttackBonus", mode: 2, value: 1, icon: "icons/weapons/ammunition/arrow-head-war-flight.webp" }, // Guessing +1 ranged?

    // --- Existing Mapping ---
    abilityImprovementCha: { label: 'Ability Improvement (Cha)', key: "system.abilities.cha.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    abilityImprovementCon: { label: 'Ability Improvement (Con)', key: "system.abilities.con.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    abilityImprovementDex: { label: 'Ability Improvement (Dex)', key: "system.abilities.dex.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    abilityImprovementInt: { label: 'Ability Improvement (Int)', key: "system.abilities.int.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    abilityImprovementStr: { label: 'Ability Improvement (Str)', key: "system.abilities.str.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    abilityImprovementWis: { label: 'Ability Improvement (Wis)', key: "system.abilities.wis.bonus", mode: 2, value: 1, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    acBonus: { label: 'AC Bonus', key: "system.bonuses.acBonus", mode: 2, value: 1, icon: "icons/skills/melee/shield-block-gray-orange.webp" },
    acBonusFromAttribute: { label: 'AC Bonus from Attribute', key: "system.bonuses.acBonusFromAttribute", mode: 2, value: "REPLACEME", icon: "icons/skills/melee/shield-block-gray-orange.webp" },
    additionalGearSlots: { label: 'Additional Gear Slots', key: "system.bonuses.gearSlots", mode: 2, value: 1, icon: "icons/magic/defensive/shield-barrier-deflect-teal.webp" },
    armorMastery: { label: 'Armor Mastery', key: "system.bonuses.armorMastery", mode: 2, value: "REPLACEME", icon: "icons/magic/defensive/shield-barrier-deflect-teal.webp" },
    backstabDie: { label: 'Backstab Die', key: "system.bonuses.backstabDie", mode: 2, value: 1, icon: "icons/skills/melee/strike-dagger-white-orange.webp" },
    backstabPlus1: { label: 'Backstab +1 Damage Dice', key: "system.bonuses.backstabDie", mode: 2, value: 1, icon: "icons/skills/melee/strike-dagger-white-orange.webp" },
    criticalFailureThreshold: { label: 'Critical Failure Threshold', key: "system.bonuses.critical.failureThreshold", mode: 5, value: 3, icon: "icons/magic/life/cross-area-circle-green-white.webp" },
    criticalSuccessThreshold: { label: 'Critical Success Threshold', key: "system.bonuses.critical.successThreshold", mode: 5, value: 18, icon: "icons/magic/fire/flame-burning-fist-strike.webp" },
    critMultiplier: { label: 'Critical Multiplier', key: "system.bonuses.critical.multiplier", mode: 5, value: 4, icon: "icons/skills/melee/hand-grip-staff-yellow-brown.webp" },
    damageMultiplier: { label: 'Damage Multiplier', key: "system.bonuses.damageMultiplier", mode: 5, value: 2, icon: "icons/skills/melee/strike-hammer-destructive-orange.webp" },
    hpAdvantage: { label: 'HP Advantage', key: "system.bonuses.advantage", mode: 2, value: "hp", icon: "icons/magic/life/cross-area-circle-green-white.webp" },
    initAdvantage: { label: 'Initiative Advantage', key: "system.bonuses.advantage", mode: 2, value: "initiative", icon: "icons/skills/movement/feet-winged-boots-glowing-yellow.webp" },
    knackSpellcasting: { label: 'Knack (Spellcasting)', key: "system.bonuses.spellcastingCheckBonus", mode: 2, value: 1, icon: "icons/magic/control/sihouette-hold-beam-green.webp" },
    lightSource: { label: 'Light Source', key: "system.light.template", mode: 5, value: "REPLACEME", icon: "icons/magic/light/torch-fire-orange.webp" },
    meleeAttackBonus: { label: 'Melee Attack Bonus', key: "system.bonuses.meleeAttackBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-polearm-glowing-white.webp" },
    meleeDamageBonus: { label: 'Melee Damage Bonus', key: "system.bonuses.meleeDamageBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityCha: { label: 'Permanent Cha', key: "system.abilities.cha.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityCon: { label: 'Permanent Con', key: "system.abilities.con.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityDex: { label: 'Permanent Dex', key: "system.abilities.dex.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityInt: { label: 'Permanent Int', key: "system.abilities.int.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityStr: { label: 'Permanent Str', key: "system.abilities.str.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    permanentAbilityWis: { label: 'Permanent Wis', key: "system.abilities.wis.base", mode: 5, value: 18, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    rangedAttackBonus: { label: 'Ranged Attack Bonus', key: "system.bonuses.rangedAttackBonus", mode: 2, value: 1, icon: "icons/weapons/ammunition/arrow-head-war-flight.webp" },
    rangedDamageBonus: { label: 'Ranged Damage Bonus', key: "system.bonuses.rangedDamageBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-axe-blood-red.webp" },
    spellAdvantage: { label: 'Spell Advantage', key: "system.bonuses.advantage", mode: 2, value: "REPLACEME", icon: "icons/magic/air/air-smoke-casting.webp" },
    spellCastingBonus: { label: 'Spellcasting Bonus', key: "system.bonuses.spellcastingCheckBonus", mode: 2, value: 1, icon: "icons/magic/fire/flame-burning-fist-strike.webp" },
    spellcastingClasses: { label: 'Spellcasting Classes', key: "system.bonuses.spellcastingClasses", mode: 2, value: "REPLACEME", icon: "icons/sundries/documents/document-sealed-brown-red.webp" },
    stoneSkinTalent: { label: 'Stone Skin', key: "system.bonuses.stoneSkinTalent", mode: 5, value: 1, icon: "icons/magic/earth/strike-fist-stone-gray.webp" },
    unarmoredAcBonus: { label: 'Unarmored AC Bonus', key: "system.bonuses.unarmoredAcBonus", mode: 2, value: 1, icon: "icons/skills/melee/shield-block-gray-orange.webp" },
    weaponAttackBonus: { label: 'Weapon Attack Bonus', key: "system.bonuses.attackBonus", mode: 2, value: 1, icon: "icons/skills/melee/strike-polearm-glowing-white.webp" },
    weaponDamageBonus: { label: 'Weapon Damage Bonus', key: "system.bonuses.damageBonus", mode: 2, value: 1, icon: "icons/weapons/ammunition/arrow-head-war-flight.webp" },
    weaponDamageDieD12: { label: 'Weapon Damage Die D12', key: "system.bonuses.weaponDamageDieD12", mode: 2, value: "REPLACEME", icon: "icons/skills/ranged/arrows-flying-salvo-blue-light.webp" },
    weaponDamageDieImprovementByProperty: { label: 'Damage Die Improvement (Property)', key: "system.bonuses.weaponDamageDieImprovementByProperty", mode: 2, value: "REPLACEME", icon: "icons/skills/ranged/arrows-flying-salvo-blue-light.webp" },
    weaponDamageExtraDieByProperty: { label: 'Extra Damage Die (Property)', key: "system.bonuses.weaponDamageExtraDieByProperty", mode: 2, value: "REPLACEME", icon: "icons/skills/ranged/arrows-flying-salvo-blue-light.webp" },
    weaponDamageExtraDieImprovementByProperty: { label: 'Extra Damage Die Improvement (Property)', key: "system.bonuses.weaponDamageExtraDieImprovementByProperty", mode: 2, value: "REPLACEME", icon: "icons/skills/ranged/arrows-flying-salvo-blue-light.webp" },
    weaponDamageMultiplier: { label: 'Weapon Damage Multiplier', key: "system.bonuses.damageMultiplier", mode: 5, value: 2, icon: "icons/skills/melee/strike-hammer-destructive-orange.webp" },
    weaponMastery: { label: 'Weapon Mastery', key: "system.bonuses.weaponMastery", mode: 2, value: "REPLACEME", icon: "icons/skills/melee/weapons-crossed-swords-white-blue.webp" }
};
