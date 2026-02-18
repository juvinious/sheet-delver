import { GenericSystemAdapter } from '../generic/adapter';

interface ClassItem {
    name: string;
    description: string;
}

export class MorkBorgAdapter extends GenericSystemAdapter {
    systemId = 'morkborg';

    getClass(actor: any): ClassItem {
        //return actor.items?.find((i: any) => i.type === 'class')?.name || 'Unknown';
        const classItem = actor.items?.find((i: any) => i.type === 'class');
        return {
            name: classItem?.name || 'Unknown',
            description: classItem?.system?.description || ''
        };
    }

    match(actor: any): boolean {
        const hasMorkborgType = ['player', 'character', 'npc'].includes(actor.type?.toLowerCase());
        return actor.systemId === 'morkborg' || hasMorkborgType;
    }

    normalizeActorData(actor: any, client?: any): any {
        const data = super.normalizeActorData(actor);

        if (client && data.items) {
            data.items = data.items.map((item: any) => {
                if (item.img) {
                    item.img = client.resolveUrl(item.img);
                }
                return item;
            });
        }

        return data;
    }



    /**
     * Compute derived actor data (HP, omens, powers, abilities, encumbrance)
     */
    computeActorData(actor: any): any {
        const system = actor.system || {};
        const abilities = system.abilities || {};
        const classData = this.getClass(actor);
        const slotsUsed = this.calculateSlotsUsed(actor);
        const maxSlots = this.calculateMaxSlots(actor);

        return {
            hp: {
                value: system.hp?.value ?? 0,
                max: system.hp?.max ?? 1
            },
            class: classData,
            currentHp: system.hp?.value ?? 0,
            maxHp: system.hp?.max ?? 1,
            omens: {
                value: system.omens?.value ?? 0,
                max: system.omens?.max ?? 0
            },
            powers: {
                value: system.powerUses?.value ?? 0,
                max: system.powerUses?.max ?? 0
            },
            abilities: {
                strength: { value: abilities.strength?.value ?? 0 },
                agility: { value: abilities.agility?.value ?? 0 },
                presence: { value: abilities.presence?.value ?? 0 },
                toughness: { value: abilities.toughness?.value ?? 0 }
            },
            slotsUsed: slotsUsed,
            maxSlots: maxSlots,
            encumbered: slotsUsed > maxSlots,
            encumbranceHelpText: 'STR+8 carried items or DR+2 on AGI/STR tests.',
            criticalHelpText: 'Crit: Gain free attack. Fumble: Take x2 damage, armor reduced one tier.',
            silver: system.silver ?? 0
        };
    }

    /**
     * Categorize items by type
     */
    categorizeItems(actor: any): any {
        const items = actor.items || [];
        return {
            weapons: items.filter((i: any) => i.type === 'weapon'),
            armor: items.filter((i: any) => i.type === 'armor'),
            equipment: items.filter((i: any) => ['misc', 'container', 'ammo'].includes(i.type?.toLowerCase())),
            scrolls: items.filter((i: any) => ['scroll', 'tablet'].includes(i.type?.toLowerCase())),
            feats: items.filter((i: any) => i.type === 'feat'),
            abilities: items.filter((i: any) => !['class', 'weapon', 'armor', 'shield', 'misc', 'container', 'scroll', 'tablet', 'ammo', 'feat'].includes(i.type?.toLowerCase()))
        };
    }

    /**
     * Calculate slots used based on item weights
     */
    private calculateSlotsUsed(actor: any): number {
        if (!actor.items) return 0;

        // Mork Borg equipment types that count towards weight
        const equipmentTypes = ['ammo', 'armor', 'container', 'misc', 'scroll', 'shield', 'weapon'];

        return actor.items.reduce((acc: number, item: any) => {
            // Only count "equipment" types (traits/feats don't count)
            if (!equipmentTypes.includes(item.type?.toLowerCase())) return acc;

            const weight = item.system?.weight ?? item.system?.carryWeight ?? 0;
            const quantity = item.system?.quantity ?? 1;

            return acc + Math.ceil(weight * quantity);
        }, 0);
    }

    /**
     * Calculate maximum slots (base 8 + strength modifier)
     */
    private calculateMaxSlots(actor: any): number {
        const strengthMod = actor.system?.abilities?.strength?.value ?? 0;
        return 8 + strengthMod;
    }

    /**
     * Get roll data for Mörk Borg actions
     */
    getRollData(actor: any, type: string, key: string, options: any = {}): { formula: string; type: string; label: string; flags?: any } | null {
        const system = actor.system || {};
        const abilities = system.abilities || {};

        if (type === 'dice') {
            return {
                formula: key,
                type: 'dice',
                label: options.flavor || 'Roll'
            };
        }

        if (type === 'ability') {
            const stat = abilities[key]?.value ?? 0;
            const sign = stat >= 0 ? '+' : '';
            return {
                formula: `1d20${sign}${stat}`,
                type: 'ability',
                label: `${key.toUpperCase()} Test`
            };
        }

        if (type === 'item') {
            const item = (actor.items || []).find((i: any) => i.uuid === key || i._id === key || i.id === key);
            if (options.rollType === 'attack') {
                // Presence for ranged, Strength for melee
                // Broad heuristic: check if weapon says 'ranged' or 'presence'
                const isRanged = item?.system?.type?.toLowerCase() === 'ranged' ||
                    item?.system?.usage?.toLowerCase() === 'presence';
                const mod = isRanged ? (abilities.presence?.value ?? 0) : (abilities.strength?.value ?? 0);
                const sign = mod >= 0 ? '+' : '';
                return {
                    formula: `1d20${sign}${mod}`,
                    type: 'attack',
                    label: `Attack: ${item?.name || 'Weapon'}`
                };
            }

            if (options.rollType === 'defend') {
                // Agility for defense
                const mod = abilities.agility?.value ?? 0;
                const sign = mod >= 0 ? '+' : '';
                return {
                    formula: `1d20${sign}${mod}`,
                    type: 'defend',
                    label: `Defense: ${item?.name || 'Armor'}`
                };
            }

            if (item?.type === 'scroll' || item?.type === 'power' || item?.type === 'feat') {
                // Presence for powers
                const mod = abilities.presence?.value ?? 0;
                const sign = mod >= 0 ? '+' : '';
                return {
                    formula: `1d20${sign}${mod}`,
                    type: 'power',
                    label: `Power: ${item?.name}`
                };
            }
        }

        return {
            formula: '1d20',
            type: 'default',
            label: 'Roll'
        };
    }

    /**
     * Get adapter configuration (server-side, no browser access needed)
     * This includes UI configuration like actorCard.subtext
     */
    getConfig() {
        return {
            actorCard: {
                // Subtext paths to display on actor cards
                // Format: ["path.to.field", "another.path"]
                subtext: ['derived.class.name']
            }
        };
    }
}
