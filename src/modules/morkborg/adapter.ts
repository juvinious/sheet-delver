import { GenericSystemAdapter } from '../generic/adapter';

export class MorkBorgAdapter extends GenericSystemAdapter {
    systemId = 'morkborg';

    match(actor: any): boolean {
        return actor.systemId === 'morkborg' || !!actor.system?.omens || !!actor.system?.miseries || (actor.id === 'kwBs8lhMY58BLYFt' || actor.id === 'IbsumID');
    }

    /**
     * Compute derived actor data (HP, omens, powers, abilities, encumbrance)
     */
    computeActorData(actor: any): any {
        const system = actor.system || {};
        const abilities = system.abilities || {};

        return {
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
}
