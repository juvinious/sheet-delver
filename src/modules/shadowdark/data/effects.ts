
export const PREDEFINED_EFFECTS = [
    {
        id: "light",
        name: "Light Source",
        img: "icons/magic/light/torch-burn-orange.webp",
        effectKey: "system.light.active",
        defaultValue: true,
        mode: 2
    },
    {
        id: "turning",
        name: "Turning Check Bonus",
        img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
        effectKey: "system.bonuses.turning",
        defaultValue: 1,
        mode: 2
    },
    {
        id: "spellcasting_check",
        name: "Spellcasting Check Bonus",
        img: "icons/magic/symbols/runes-star-blue.webp",
        effectKey: "system.bonuses.spellcasting.check",
        defaultValue: 1,
        mode: 2
    },
    {
        id: "spellcasting_advantage",
        name: "Spellcasting Advantage on Spell",
        img: "icons/magic/symbols/runes-star-blue.webp",
        effectKey: "system.bonuses.advantage",
        defaultValue: "spell-name",
        mode: 2
    },
    {
        id: "attack_bonus",
        name: "Attack Bonus",
        img: "icons/skills/melee/strike-sword-steel.webp",
        effectKey: "system.bonuses.attackBonus",
        defaultValue: 1,
        mode: 2
    },
    {
        id: "damage_bonus",
        name: "Damage Bonus",
        img: "icons/skills/melee/strike-blood-red.webp",
        effectKey: "system.bonuses.damageBonus",
        defaultValue: 1,
        mode: 2
    },
    {
        id: "ac_bonus",
        name: "AC Bonus",
        img: "icons/equipment/shield/heater-wooden-iron.webp",
        effectKey: "system.bonuses.ac",
        defaultValue: 1,
        mode: 2
    },
    {
        id: "blinded",
        name: "Blinded",
        img: "icons/svg/blind.svg",
        effectKey: "system.condition.blinded",
        defaultValue: true,
        mode: 5
    },
    {
        id: "deafened",
        name: "Deafened",
        img: "icons/svg/deaf.svg",
        effectKey: "system.condition.deafened",
        defaultValue: true,
        mode: 5
    },
    {
        id: "invisible",
        name: "Invisible",
        img: "icons/svg/invisible.svg",
        effectKey: "system.condition.invisible",
        defaultValue: true,
        mode: 5
    },
    {
        id: "paralyzed",
        name: "Paralyzed",
        img: "icons/svg/paralysis.svg",
        effectKey: "system.condition.paralyzed",
        defaultValue: true,
        mode: 5
    }
];
