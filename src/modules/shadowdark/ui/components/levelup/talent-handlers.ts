import { logger } from '@/app/ui/logger';
import { SYSTEM_PREDEFINED_EFFECTS } from '../../../data/talent-effects';

export interface TalentHandler {
    id: string;
    description: string;
    /**
     * Check if this handler applies to the given item/text
     */
    matches: (item: any) => boolean;

    /**
     * Logic to execute when the talent is rolled.
     * Takes the simplified actions object from useLevelUp.
     */
    onRoll?: (actions: any) => void;

    /**
     * Logic to determine initialization state (e.g. adding required talents like Ambitious)
     */
    onInit?: (context: { actor: any, targetLevel: number }) => { requiredTalents?: number; choiceRolls?: number };

    /**
     * Logic to prevent completion if requirements aren't met
     */
    isBlocked?: (state: any) => boolean;

    /**
     * Resolve final items/effects to add to the actor
     */
    resolveItems?: (state: any, targetLevel: number, fetchDocument?: (uuid: string) => Promise<any>) => Promise<any[]>;

    /**
     * modify the rolled item in place (e.g. adding predefinedEffects)
     */
    mutateItem?: (item: any, state: any) => void;
}

export const TALENT_HANDLERS: TalentHandler[] = [
    {
        id: 'ambitious',
        description: "Human Talent: Ambitious (Additional Talent at Level 1)",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            return name === 'ambitious';
        },
        onInit: ({ actor, targetLevel }) => {
            if (targetLevel === 1) {
                // If actor has Ambitious, they get +1 talent
                const hasAmbitious = actor.items?.find((i: any) => i.name === 'Ambitious');
                if (hasAmbitious) return { requiredTalents: 1 };
            }
            return {};
        }
    },
    {
        id: 'stat-improvement',
        description: "Gain +1 to two stats",
        matches: (item: any) => {
            const text = (item.text || item.name || item.description || "").toLowerCase();
            return text.includes("+1 point to two stats") || text.includes("+1 to two stats");
        },
        onRoll: (actions: any) => {
            logger.debug("[TalentHandler] Triggering Stat Selection");
            if (actions.setStatSelection) {
                actions.setStatSelection({ required: 2, selected: [] });
            }
        },
        isBlocked: (state: any) => {
            if (state.statSelection && state.statSelection.required > 0) {
                return state.statSelection.selected.length < state.statSelection.required;
            }
            return false;
        },
        mutateItem: (item: any, state: any) => {
            if (state.statSelection && state.statSelection.selected.length > 0) {
                const selectionMap: Record<string, string> = {
                    'str': 'abilityImprovementStr',
                    'dex': 'abilityImprovementDex',
                    'con': 'abilityImprovementCon',
                    'int': 'abilityImprovementInt',
                    'wis': 'abilityImprovementWis',
                    'cha': 'abilityImprovementCha'
                };

                const effects = state.statSelection.selected
                    .map((s: string) => selectionMap[s])
                    .filter((s: string) => s)
                    .join(',');

                if (effects) {
                    if (!item.system) item.system = {};
                    item.system.predefinedEffects = effects;

                    // Manually inject the Active Effect to ensure it works even if Foundry hooks don't fire
                    if (!item.effects) item.effects = [];

                    state.statSelection.selected.forEach((stat: string) => {
                        const effectConfig = SYSTEM_PREDEFINED_EFFECTS[selectionMap[stat]];

                        if (effectConfig) {
                            item.effects.push({
                                name: `Ability Score Improvement (${effectConfig.label})`,
                                icon: effectConfig.icon,
                                changes: [
                                    {
                                        key: effectConfig.key,
                                        mode: effectConfig.mode,
                                        value: String(effectConfig.value)
                                    }
                                ],
                                transfer: true
                            });
                        }
                    });
                }
            }
        }
    },
    {
        id: 'weapon-mastery',
        description: "Choose one type of weapon",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            // Check name or specific ID
            return name === 'weapon mastery' || item._id === '5bpWuaT0KTNzuzCu';
        },
        onRoll: (actions: any) => {
            if (actions.setWeaponMasterySelection) {
                actions.setWeaponMasterySelection({ required: 1, selected: [] });
            }
        },
        isBlocked: (state: any) => {
            if (state.weaponMasterySelection && state.weaponMasterySelection.required > 0) {
                return state.weaponMasterySelection.selected.length < state.weaponMasterySelection.required;
            }
            return false;
        },
        resolveItems: async (state: any, targetLevel: number, fetchDocument?: (uuid: string) => Promise<any>) => {
            const items = [];
            if (state.weaponMasterySelection && state.weaponMasterySelection.selected.length > 0) {
                const selection = state.weaponMasterySelection.selected[0];
                const uuid = 'Compendium.shadowdark.talents.5bpWuaT0KTNzuzCu';

                let added = false;
                if (fetchDocument) {
                    try {
                        const doc = await fetchDocument(uuid);
                        if (doc) {
                            const cleaned = { ...doc };
                            delete cleaned._id;
                            if (!cleaned.system) cleaned.system = {};
                            cleaned.system.level = targetLevel;

                            // Inject Selection
                            if (cleaned.system.bonuses) {
                                cleaned.system.bonuses.weaponMastery = selection.toLowerCase();
                            }
                            // Update name to reflect choice
                            cleaned.name = `${cleaned.name} (${selection})`;

                            items.push(cleaned);
                            added = true;
                        }
                    } catch (e) { console.warn("[TalentHandler] Failed master fetch", e); }
                }

                if (!added) {
                    items.push({
                        name: `Weapon Mastery (${selection})`,
                        type: 'Talent',
                        img: 'icons/skills/melee/weapons-crossed-swords-white-blue.webp',
                        system: {
                            level: targetLevel,
                            bonuses: { weaponMastery: selection.toLowerCase() },
                            description: `<p>You gain +1 to attack and damage with ${selection}.</p>`
                        }
                    });
                }
            }
            return items;
        }
    },
    {
        id: 'armor-mastery',
        description: "Choose one type of armor",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            return name === 'armor mastery' || item._id === '0g9MUhj9Tr3AWRXl';
        },
        onRoll: (actions: any) => {
            if (actions.setArmorMasterySelection) {
                actions.setArmorMasterySelection({ required: 1, selected: [] });
            }
        },
        isBlocked: (state: any) => {
            if (state.armorMasterySelection && state.armorMasterySelection.required > 0) {
                return state.armorMasterySelection.selected.length < state.armorMasterySelection.required;
            }
            return false;
        },
        resolveItems: async (state: any, targetLevel: number, fetchDocument?: (uuid: string) => Promise<any>) => {
            const items = [];
            if (state.armorMasterySelection && state.armorMasterySelection.selected.length > 0) {
                const selection = state.armorMasterySelection.selected[0];
                const uuid = 'Compendium.shadowdark.talents.0g9MUhj9Tr3AWRXl';

                let added = false;
                if (fetchDocument) {
                    try {
                        const doc = await fetchDocument(uuid);
                        if (doc) {
                            const cleaned = { ...doc };
                            delete cleaned._id;
                            if (!cleaned.system) cleaned.system = {};
                            cleaned.system.level = targetLevel;

                            // Inject Selection
                            if (cleaned.system.bonuses) {
                                cleaned.system.bonuses.armorMastery = selection.toLowerCase();
                            }
                            // Update name
                            cleaned.name = `${cleaned.name} (${selection})`;

                            // Also update changes if it's an Effect type item (Armor Mastery is 'base' type item with changes)
                            if (cleaned.changes) {
                                cleaned.changes.forEach((c: any) => {
                                    if (c.value === 'REPLACEME') c.value = selection.toLowerCase();
                                });
                            }

                            items.push(cleaned);
                            added = true;
                        }
                    } catch (e) { console.warn("[TalentHandler] Failed armor fetch", e); }
                }

                if (!added) {
                    items.push({
                        name: `Armor Mastery (${selection})`,
                        type: 'Talent',
                        img: 'icons/magic/defensive/shield-barrier-deflect-teal.webp',
                        system: {
                            level: targetLevel,
                            bonuses: { armorMastery: selection.toLowerCase() },
                            description: `<p>You gain +1 AC with ${selection}.</p>`
                        }
                    });
                }
            }
            return items;
        }
    },
    {
        id: 'extra-spell-boon',
        description: "Learn an extra spell (Wizard, Priest, Witch, etc.)",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            return name.includes("learn a") && name.includes("spell");
        },
        onRoll: (actions: any) => {
            const level = actions.targetLevel || 1;
            const maxTier = Math.ceil(level / 2);

            // Extract class from name if possible
            const name = (actions.rolledItem?.name || "").toLowerCase();
            const classes = ['wizard', 'priest', 'witch', 'warlock', 'ranger', 'bard', 'druid'];
            let foundCls = 'Wizard'; // Default
            for (const cls of classes) {
                if (name.includes(cls)) {
                    foundCls = cls.charAt(0).toUpperCase() + cls.slice(1);
                    break;
                }
            }

            if (actions.setExtraSpellSelection) {
                actions.setExtraSpellSelection({
                    active: true,
                    source: foundCls,
                    maxTier: Math.min(5, maxTier),
                    selected: []
                });
            }
        },
        mutateItem: (item: any) => {
            const name = (item.name || "").toLowerCase();
            const classes = ['wizard', 'priest', 'witch', 'warlock', 'ranger', 'bard', 'druid'];
            let foundCls = '';
            for (const cls of classes) {
                if (name.includes(cls)) {
                    foundCls = cls;
                    break;
                }
            }

            if (foundCls) {
                if (!item.system) item.system = {};

                // Set the predefined effect key
                item.system.predefinedEffects = 'spellcastingClasses';

                // Add the Active Effect for robustness
                const effectConfig = SYSTEM_PREDEFINED_EFFECTS.spellcastingClasses;
                if (!item.effects) item.effects = [];

                const hasEffect = item.effects.some((e: any) =>
                    e.name === "Bonus Spellcasting Class" ||
                    e.changes?.some((c: any) => c.key === effectConfig.key)
                );

                if (!hasEffect) {
                    item.effects.push({
                        name: "Bonus Spellcasting Class",
                        icon: effectConfig.icon,
                        changes: [
                            {
                                key: effectConfig.key,
                                mode: effectConfig.mode,
                                value: foundCls
                            }
                        ],
                        transfer: true
                    });
                }
            }
        },
        isBlocked: (state: any) => {
            if (state.extraSpellSelection && state.extraSpellSelection.active) {
                return state.extraSpellSelection.selected.length < 1;
            }
            return false;
        }
    }
];
