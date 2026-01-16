import { SystemAdapter } from './SystemAdapter';
import type { FoundryClient } from '../client';

export class MorkBorgAdapter implements SystemAdapter {
    systemId = 'morkborg';

    async getActor(client: FoundryClient, actorId: string): Promise<any> {
        return await client.evaluate(async (id) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return null;

            // --- ITEM PROCESSING ---
            const items = {
                weapons: [] as any[],
                armor: [] as any[],
                equipment: [] as any[],
                scrolls: [] as any[],
                abilities: [] as any[] // Class abilities/Feats
            };

            let totalSlotsUsed = 0;

            // @ts-ignore
            const rawItems = actor.items.contents;

            for (const i of rawItems) {
                const itemData: any = {
                    id: i.id,
                    name: i.name,
                    type: i.type,
                    img: i.img,
                    system: i.system,
                    uuid: `Actor.${id}.Item.${i.id}`,
                    quantity: i.system.quantity || 1,
                    equipped: i.system.equipped || false
                };

                // Calculate Slots
                // Mork Borg: Usually 1 item = 1 slot, unless specified.
                // Template says "containerSpace" defaults to 1.
                // Some items (like currency) might be 0? 
                // Scrolls are 0 or 1? Rules say scrolls take space.
                const slots = i.system.containerSpace || 0;
                // Note: MB rules say 100 silver = 1 slot. 
                // But generally items have a defined size.
                itemData.slots = slots * itemData.quantity;
                if (itemData.equipped || i.system.carried) { // MB tracks carried items
                    totalSlotsUsed += itemData.slots;
                }

                // Categorize
                if (i.type === 'weapon') {
                    items.weapons.push(itemData);
                } else if (i.type === 'armor' || i.type === 'shield') {
                    items.armor.push(itemData);
                } else if (i.type === 'scroll') {
                    itemData.isUnclean = i.system.scrollType === 'unclean';
                    itemData.isSacred = i.system.scrollType === 'sacred';
                    items.scrolls.push(itemData);
                } else if (i.type === 'feat' || i.type === 'class') {
                    items.abilities.push(itemData);
                } else {
                    // Misc, Container, etc.
                    items.equipment.push(itemData);
                }
            }

            // --- EFFECTS PROCESSING ---
            // @ts-ignore
            const effects = Array.from(actor.allApplicableEffects()).map((e: any) => ({
                _id: e.id,
                name: e.name,
                img: e.img,
                disabled: e.disabled
            }));

            // --- COMPUTED STATS ---
            const computed: any = {
                maxHp: actor.system.hp.max,
                currentHp: actor.system.hp.value,
                omens: {
                    value: actor.system.omens?.value || 0,
                    max: actor.system.omens?.max || 0
                },
                powers: {
                    value: actor.system.powerUses?.value || 0,
                    max: actor.system.powerUses?.max || 0,
                    // Different sheets track this differently, sometimes just a daily max
                    daily: actor.system.powerUses?.max || 0
                },
                silver: actor.system.currency?.silver || actor.system.silver || 0, // Check both locations
                // Load Capacity: Strength + 8
                maxSlots: (actor.system.abilities?.strength?.value || 0) + 8,
                slotsUsed: totalSlotsUsed,
                encumbered: totalSlotsUsed > ((actor.system.abilities?.strength?.value || 0) + 8)
            };

            // Abilities formatting
            const abilities = {
                agility: { value: actor.system.abilities?.agility?.value || 0, label: "Agility" },
                presence: { value: actor.system.abilities?.presence?.value || 0, label: "Presence" },
                strength: { value: actor.system.abilities?.strength?.value || 0, label: "Strength" },
                toughness: { value: actor.system.abilities?.toughness?.value || 0, label: "Toughness" }
            };
            computed.abilities = abilities;

            return {
                id: actor.id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                systemId: 'morkborg',
                system: actor.system,
                items: items, // Categorized items
                effects: effects,
                computed: computed,
                // @ts-ignore
                currentUser: window.game.user ? window.game.user.name : 'Unknown'
            };
        }, actorId);
    }

    async getSystemData(client: FoundryClient): Promise<any> {
        return await client.evaluate(async () => {
            // Fetch simplified system data for MB
            // We'll focus on just getting compendium indices for now
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results = {
                scrolls: [],
                equipment: []
            };

            // TODO: Real implementation for browsing compendiums
            return results;
        });
    }
}
