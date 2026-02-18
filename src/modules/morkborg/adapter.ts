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
        //console.log(`found class name: ` + actor.items.filter((i: any) => i.type === 'class')[0].name);
        const classData = this.getClass(actor);

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
            slotsUsed: this.calculateSlotsUsed(actor),
            maxSlots: this.calculateMaxSlots(actor),
            encumbered: this.isEncumbered(actor),
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
            equipment: items.filter((i: any) => i.type === 'misc'),
            scrolls: items.filter((i: any) => i.type === 'scroll'),
            abilities: items.filter((i: any) => i.type === 'feat')
        };
    }

    /**
     * Calculate slots used based on item weights
     */
    private calculateSlotsUsed(actor: any): number {
        const items = actor.items || [];
        let totalSlots = 0;

        for (const item of items) {
            if (item.system?.carried === false) continue;

            const weight = item.system?.carryWeight ?? item.system?.containerSpace ?? 0;
            const quantity = item.system?.quantity ?? 1;
            totalSlots += weight * quantity;
        }

        return Math.ceil(totalSlots);
    }

    /**
     * Calculate maximum slots (base 10 + strength modifier)
     */
    private calculateMaxSlots(actor: any): number {
        const strengthMod = actor.system?.abilities?.strength?.value ?? 0;
        return 10 + strengthMod;
    }

    /**
     * Check if actor is encumbered
     */
    private isEncumbered(actor: any): boolean {
        return this.calculateSlotsUsed(actor) > this.calculateMaxSlots(actor);
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
