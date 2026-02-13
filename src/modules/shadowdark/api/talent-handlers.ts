import { SYSTEM_PREDEFINED_EFFECTS, findEffectUuid } from '../data/talent-effects';
import { logger } from '../../../core/logger';
import { dataManager } from '../data/DataManager';

export interface TalentHandler {
    id: string;
    description: string;
    matches: (item: any) => boolean;
    onRoll?: (context: any) => void | boolean;
    action?: 'stat-selection' | 'stat-pool' | 'weapon-mastery' | 'armor-mastery' | 'extra-spell' | 'language-selection';
    config?: any;
    onInit?: (context: { actor: any, targetLevel: number }) => { requiredTalents?: number; choiceRolls?: number };
    isBlocked?: (state: any) => boolean;
    resolveItems?: (state: any, targetLevel: number, client?: any) => Promise<any[]>;
    mutateItem?: (item: any, state: any) => void;
}

export const TALENT_HANDLERS: TalentHandler[] = [
    {
        id: 'stat-improvement',
        description: "Gain +1 to two stats",
        matches: (item: any) => {
            const text = (item.text || item.name || item.description || "").toLowerCase();
            return text.includes("+1 point to two stats") || text.includes("+1 to two stats");
        },
        action: 'stat-selection',
        config: { required: 2 },
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
        id: 'stat-distribution',
        description: "Distribute +2 points across any stats",
        matches: (item: any) => {
            // Check for direct Table match (nested table result)
            if (item.name === "Distribute to Stats") return true;

            const text = (item.text || item.description || "").toLowerCase();
            return text.includes("distribute") && text.includes("+2") && text.includes("stat");
        },
        action: 'stat-pool',
        config: { total: 2 },
        mutateItem: (item: any, state: any) => {
            if (state.statPool && state.statPool.total > 0) {
                const allocated = state.statPool.allocated;
                const effects: string[] = [];

                if (!item.effects) item.effects = [];
                item.effects = (item.effects || []).filter((e: any) =>
                    !e.name.startsWith("Stat Distribution") &&
                    !e.name.startsWith("Ability Score Improvement")
                );

                Object.entries(allocated).forEach(([stat, val]) => {
                    const value = Number(val);
                    if (value > 0) {
                        const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
                        const effectKey = `abilityImprovement${statName}`;
                        effects.push(effectKey);

                        const config = SYSTEM_PREDEFINED_EFFECTS[effectKey];
                        if (config) {
                            item.effects.push({
                                name: `Ability Score Improvement (${config.label})`,
                                icon: config.icon,
                                changes: [
                                    {
                                        key: config.key,
                                        mode: config.mode,
                                        value: String(value)
                                    }
                                ],
                                transfer: true
                            });
                        }
                    }
                });

                if (effects.length > 0) {
                    if (!item.system) item.system = {};
                    item.system.predefinedEffects = effects.join(',');
                }
            }
        }
    },
    {
        id: 'stat-distribution-warlock',
        description: "Distribute +2 points (max 1 per stat)",
        matches: (item: any) => {
            return item.name === "Distribute to Stats (Warlock)";
        },
        action: 'stat-pool',
        config: { total: 2, maxPerStat: 1 },
        mutateItem: (item: any, state: any) => {
            // Re-use logic from stat-distribution
            if (state.statPool && state.statPool.total > 0) {
                const allocated = state.statPool.allocated;
                const effects: string[] = [];

                if (!item.effects) item.effects = [];
                item.effects = (item.effects || []).filter((e: any) =>
                    !e.name.startsWith("Stat Distribution") &&
                    !e.name.startsWith("Ability Score Improvement")
                );

                Object.entries(allocated).forEach(([stat, val]) => {
                    const value = Number(val);
                    if (value > 0) {
                        const statName = stat.charAt(0).toUpperCase() + stat.slice(1);
                        const effectKey = `abilityImprovement${statName}`;
                        effects.push(effectKey);

                        const config = SYSTEM_PREDEFINED_EFFECTS[effectKey];
                        if (config) {
                            item.effects.push({
                                name: `Ability Score Improvement (${config.label})`,
                                icon: config.icon,
                                changes: [
                                    {
                                        key: config.key,
                                        mode: config.mode,
                                        value: String(value)
                                    }
                                ],
                                transfer: true
                            });
                        }
                    }
                });

                if (effects.length > 0) {
                    if (!item.system) item.system = {};
                    item.system.predefinedEffects = effects.join(',');
                }
            }
        }
    },
    {
        id: 'weapon-mastery',
        description: "Choose one type of weapon",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            return name === 'weapon mastery' || item._id === '5bpWuaT0KTNzuzCu';
        },
        action: 'weapon-mastery',
        config: { required: 1 },
        resolveItems: async (state: any, targetLevel: number, client?: any) => {
            const items = [];
            if (state.weaponMasterySelection && state.weaponMasterySelection.selected.length > 0) {
                const selection = state.weaponMasterySelection.selected[0];
                const uuid = 'Compendium.shadowdark.talents.5bpWuaT0KTNzuzCu';

                let doc = null;
                if (client) {
                    doc = await client.fetchByUuid(uuid);
                } else {
                    doc = await dataManager.getDocument(uuid);
                }

                if (doc) {
                    const cleaned = { ...doc };
                    delete cleaned._id;
                    if (!cleaned.system) cleaned.system = {};
                    cleaned.system.level = targetLevel;

                    if (cleaned.system.bonuses) {
                        cleaned.system.bonuses.weaponMastery = selection.toLowerCase();
                    }
                    cleaned.name = `${cleaned.name} (${selection})`;

                    // Update embedded effects
                    if (cleaned.effects) {
                        cleaned.effects.forEach((effect: any) => {
                            if (effect.changes) {
                                effect.changes.forEach((c: any) => {
                                    if (c.value === 'REPLACEME') c.value = selection.toLowerCase();
                                });
                            }
                        });
                    }

                    items.push(cleaned);
                } else {
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
            return name === 'armor mastery' || item._id === 'BsRPGhKXYwJBI9ex' || item._id === '0g9MUhj9Tr3AWRXl';
        },
        action: 'armor-mastery',
        config: { required: 1 },
        resolveItems: async (state: any, targetLevel: number, client?: any) => {
            const items = [];
            if (state.armorMasterySelection && state.armorMasterySelection.selected.length > 0) {
                const selection = state.armorMasterySelection.selected[0];
                const uuid = 'Compendium.shadowdark.talents.BsRPGhKXYwJBI9ex';

                let doc = null;
                if (client) {
                    doc = await client.fetchByUuid(uuid);
                } else {
                    doc = await dataManager.getDocument(uuid);
                }

                if (doc) {
                    const cleaned = { ...doc };
                    delete cleaned._id;
                    if (!cleaned.system) cleaned.system = {};
                    cleaned.system.level = targetLevel;

                    if (cleaned.system.bonuses) {
                        cleaned.system.bonuses.armorMastery = selection.toLowerCase();
                    }
                    cleaned.name = `${cleaned.name} (${selection})`;

                    // Update embedded effects
                    if (cleaned.effects) {
                        cleaned.effects.forEach((effect: any) => {
                            if (effect.changes) {
                                effect.changes.forEach((c: any) => {
                                    if (c.value === 'REPLACEME') c.value = selection.toLowerCase();
                                });
                            }
                        });
                    }

                    // Legacy check for 'changes' on top level (if some older DB format exists)
                    if (cleaned.changes) {
                        cleaned.changes.forEach((c: any) => {
                            if (c.value === 'REPLACEME') c.value = selection.toLowerCase();
                        });
                    }

                    items.push(cleaned);
                } else {
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
        description: "Learn an extra spell",
        matches: (item: any) => {
            const name = (item.name || item.text || item.description || "").toLowerCase();
            return name.includes("learn a") && name.includes("spell");
        },
        action: 'extra-spell',
        config: { active: true, count: 1 },
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
                item.system.predefinedEffects = 'spellcastingClasses';

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
        }
    },
    {
        id: 'missing-effects',
        description: "Apply standard effects from SYSTEM_PREDEFINED_EFFECTS if missing or invalid",
        matches: (item: any) => {
            const effects = item.effects;
            const hasInvalidEffects = effects && Array.isArray(effects) && effects.length > 0 && typeof effects[0] === 'string';
            if (hasInvalidEffects) return true;

            const name = (item.name || "").toLowerCase();
            const hasDefinition = Object.values(SYSTEM_PREDEFINED_EFFECTS).some((def: any) =>
                name.includes(def.label.toLowerCase()) ||
                def.label.toLowerCase().includes(name)
            );

            const isMissingEffects = !effects || (Array.isArray(effects) && effects.length === 0);
            return isMissingEffects && hasDefinition;
        },
        mutateItem: (item: any) => {
            // 1. Clean up invalid effects (strings)
            if (item.effects && Array.isArray(item.effects) && item.effects.length > 0 && typeof item.effects[0] === 'string') {
                logger.warn(`[TalentHandler] Clearing invalid string effects for ${item.name}`);
                item.effects = [];
            }

            // 2. Try to polyfill from standard definitions
            const name = (item.name || "").toLowerCase();
            const predefinedMatch = Object.values(SYSTEM_PREDEFINED_EFFECTS).find((def: any) =>
                name.includes(def.label.toLowerCase()) ||
                def.label.toLowerCase().includes(name)
            );

            if (predefinedMatch) {
                if (!item.effects) item.effects = [];

                // Deduplicate
                const exists = item.effects.some((e: any) => e.name === predefinedMatch.label);
                if (!exists) {
                    item.effects.push({
                        name: predefinedMatch.label,
                        icon: predefinedMatch.icon || "icons/svg/aura.svg",
                        changes: predefinedMatch.changes || [{
                            key: predefinedMatch.key,
                            mode: predefinedMatch.mode,
                            value: predefinedMatch.value
                        }],
                        transfer: true,
                        disabled: false,
                        _id: Math.random().toString(36).substring(2, 15) // Generate valid ID
                    });
                }
            }
        }
    }
    ,
    {
        id: 'generic-choice',
        description: "Parse 'Choose one' or 'X or Y' talents",
        matches: (item: any) => {
            const name = (item.name || "").toLowerCase();
            const text = (item.text || item.description || "").toLowerCase();
            // Match "Choose one:", "Select one:", or names containing " or " (e.g. Weapon Mastery or Armor Mastery)
            // Pattern also catches "1 CHOOSE 1" which comes from some roll tables
            const regex = /(?:choose|select)\s+(?:one|1)|\s+or\s+/i;
            return regex.test(name) || regex.test(text);
        },
        action: undefined, // Handled implicitly by choice system
        mutateItem: async (item: any) => {
            // This is mostly handled by the UI modal forcing a selection
            // but we keep the matcher for consistency
        }
    }
];
