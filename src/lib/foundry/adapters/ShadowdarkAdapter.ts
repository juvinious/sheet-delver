import { SystemAdapter } from './SystemAdapter';
import type { FoundryClient } from '../client';

export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';

    async getActor(client: FoundryClient, actorId: string): Promise<any> {
        return await client.evaluate(async (id) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return null;

            // --- SHADOWDARK ITEM PROCESSING ---
            const freeCarrySeen: Record<string, number> = {};
            // @ts-ignore
            const items = (actor.items?.contents || []).map((i: any) => {
                if (!i) return null;
                const itemData: any = {
                    id: i.id,
                    name: i.name,
                    type: i.type,
                    img: i.img,
                    system: i.system || {},
                    uuid: `Actor.${id}.Item.${i.id}`
                };

                // Calculate slot usage for physical items
                if (i.system?.isPhysical && i.type !== "Gem") {
                    let freeCarry = i.system.slots?.free_carry || 0;

                    if (freeCarrySeen[i.name]) {
                        freeCarry = Math.max(0, freeCarry - freeCarrySeen[i.name]);
                        freeCarrySeen[i.name] += freeCarry;
                    } else {
                        freeCarrySeen[i.name] = freeCarry;
                    }

                    // Calculate slots used
                    const perSlot = i.system.slots?.per_slot || 1;
                    const qty = i.system.quantity || 1;
                    const slotsUsed = i.system.slots?.slots_used || 0;

                    let totalSlotsUsed = Math.ceil(qty / perSlot) * slotsUsed;
                    totalSlotsUsed -= freeCarry * slotsUsed;

                    itemData.slotsUsed = totalSlotsUsed;
                    itemData.showQuantity = i.system.isAmmunition || (perSlot > 1) || (qty > 1);

                    // Light source progress indicators
                    if (i.type === "Basic" && i.system.light?.isSource) {
                        itemData.isLightSource = true;
                        itemData.lightSourceActive = i.system.light.active;
                        itemData.lightSourceUsed = i.system.light.hasBeenUsed;

                        const maxSeconds = (i.system.light.longevityMins || 0) * 60;
                        let progress = "◆";
                        for (let x = 1; x < 4; x++) {
                            if (i.system.light.remainingSecs > (maxSeconds * x / 4)) {
                                progress += " ◆";
                            } else {
                                progress += " ◇";
                            }
                        }
                        itemData.lightSourceProgress = progress;

                        const timeRemaining = Math.ceil(i.system.light.remainingSecs / 60);
                        if (i.system.light.remainingSecs < 60) {
                            itemData.lightSourceTimeRemaining = "< 1 min";
                        } else {
                            itemData.lightSourceTimeRemaining = `${timeRemaining} min`;
                        }
                    }
                }

                return itemData;
            }).filter((i: any) => i !== null);

            // --- SHADOWDARK EFFECTS PROCESSING ---
            let effects = [];
            try {
                // @ts-ignore - Use allApplicableEffects() to get effects from both actor and items
                if (typeof actor.allApplicableEffects === 'function') {
                    // @ts-ignore
                    effects = Array.from(actor.allApplicableEffects()).map((e: any) => ({
                        _id: e.id,
                        name: e.name,
                        img: e.img,
                        disabled: e.disabled,
                        duration: {
                            type: e.duration?.type,
                            remaining: e.duration?.remaining,
                            label: e.duration?.label,
                            startTime: e.duration?.startTime,
                            seconds: e.duration?.seconds,
                            rounds: e.duration?.rounds,
                            turns: e.duration?.turns
                        },
                        changes: e.changes,
                        origin: e.origin,
                        sourceName: e.parent?.name ?? "Unknown",
                        transfer: e.transfer,
                        statuses: Array.from(e.statuses ?? [])
                    }));
                } else if (actor.effects) {
                    // Fallback to basic effects
                    // @ts-ignore
                    effects = actor.effects.contents.map((e: any) => ({
                        _id: e.id,
                        name: e.name,
                        img: e.img,
                        disabled: e.disabled,
                        changes: e.changes
                    }));
                }
            } catch (err) {
                console.error('Error processing effects:', err);
            }

            // --- DERIVED STATS ---
            const levelVal = Number(actor.system.level?.value) || 1;
            const xpVal = Number(actor.system.level?.xp) || 0;
            const computed: any = {
                maxHp: (Number(actor.system.attributes?.hp?.base) || 0) + (Number(actor.system.attributes?.hp?.bonus) || 0),
                xpNextLevel: levelVal * 10,
                levelUp: xpVal >= (levelVal * 10)
            };

            if (actor.type === "Player") {
                try {
                    computed.ac = (typeof actor.getArmorClass === 'function') ? await actor.getArmorClass() : 10;
                } catch (err) { console.error('Error calculating AC:', err); computed.ac = 10; }

                try {
                    computed.gearSlots = (typeof actor.numGearSlots === 'function') ? actor.numGearSlots() : 10;
                } catch (err) { console.error('Error calculating Gear Slots:', err); computed.gearSlots = 10; }

                try {
                    computed.isSpellCaster = (typeof actor.isSpellCaster === 'function') ? await actor.isSpellCaster() : false;
                } catch (err) { console.error('Error checking isSpellCaster:', err); computed.isSpellCaster = false; }

                try {
                    computed.canUseMagicItems = (typeof actor.canUseMagicItems === 'function') ? await actor.canUseMagicItems() : false;
                } catch (err) { console.error('Error checking canUseMagicItems:', err); computed.canUseMagicItems = false; }

                computed.showSpellsTab = computed.isSpellCaster || computed.canUseMagicItems;

                try {
                    computed.abilities = (typeof actor.getCalculatedAbilities === 'function') ? actor.getCalculatedAbilities() : (actor.system.abilities || {});
                } catch (err) { console.error('Error calculating Abilities:', err); computed.abilities = actor.system.abilities || {}; }

                // Get spellcasting ability (e.g. "INT", "WIS")
                let spellcastingAbility = "";

                try {
                    const characterClass = actor.items.find((i: any) => i.type === "Class" || i.type === "class");

                    if (characterClass) {
                        spellcastingAbility = characterClass.system.spellcasting?.ability?.toUpperCase() || "";
                    } else if (typeof actor.system.class === 'string' && actor.system.class.length > 0) {
                        try {
                            // @ts-ignore
                            const classItem = await fromUuid(actor.system.class);
                            if (classItem) {
                                spellcastingAbility = classItem.system.spellcasting?.ability?.toUpperCase() || "";
                            }
                        } catch (e) {
                            // console.error("FoundryAdapter: Failed to resolve class UUID", e);
                        }
                    }
                } catch (err) { console.error('Error resolving class/spellcasting:', err); }

                computed.spellcastingAbility = spellcastingAbility;
            }

            return {
                id: actor.id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                systemId: 'shadowdark', // Explicitly identify the system
                system: actor.system,
                items: items,
                effects: effects,
                computed: computed,
                // @ts-ignore
                currentUser: window.game.user ? window.game.user.name : 'Unknown',
                // @ts-ignore
                systemConfig: window.game.shadowdark?.config || {}
            };
        }, actorId);
    }

    async getSystemData(client: FoundryClient): Promise<any> {
        return await client.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results = {
                classes: [] as any[],
                ancestries: [] as any[],
                backgrounds: [] as any[],
                languages: [] as any[],
                titles: {} // Cache titles by Class Name -> { level, name }[]
            };

            for (const pack of packs) {
                // @ts-ignore
                if (pack.documentName !== 'Item') continue;

                // @ts-ignore
                if (!pack.index.size) await pack.getIndex();
                // @ts-ignore
                const index = pack.index;

                // @ts-ignore
                // Index Classes
                const classIndex = index.filter((i: any) => i.type === 'Class');
                for (const c of classIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(c._id);
                    if (doc) {
                        // @ts-ignore
                        results.classes.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${c._id}`,
                            languages: doc.system?.languages || []
                        });
                    }
                }

                // Index Ancestries
                const ancestryIndex = index.filter((i: any) => i.type === 'Ancestry');
                for (const a of ancestryIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(a._id);
                    if (doc) {
                        results.ancestries.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${a._id}`,
                            languages: doc.system?.languages || []
                        });
                    }
                }

                // @ts-ignore
                results.backgrounds.push(...index.filter(i => i.type === 'Background').map(i => ({ name: i.name, uuid: `Compendium.${pack.collection}.Item.${i._id}` })));

                // Index Languages
                const langIndex = index.filter((i: any) => i.type === 'Language');
                for (const l of langIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(l._id);
                    if (doc) {
                        // @ts-ignore
                        results.languages.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${l._id}`,
                            description: (typeof doc.system?.description === 'string' ? doc.system.description : doc.system?.description?.value) || doc.system?.desc || '',
                            rarity: doc.system?.rarity || 'common'
                        });
                    }
                }

                // Deep Fetch for Titles (only for Classes)
                for (const c of classIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(c._id);
                    if (doc && doc.system?.titles) {
                        // @ts-ignore
                        results.titles[doc.name] = doc.system.titles;
                    }
                }
            }
            return results;
        });
    }
}
