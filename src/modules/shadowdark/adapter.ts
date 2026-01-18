import { SystemAdapter, ActorSheetData } from '../core/interfaces';
import { calculateItemSlots, calculateMaxSlots } from './rules';

export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';

    async getActor(client: any, actorId: string): Promise<any> {
        const actorData = await client.evaluate(async (id: string) => {
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
                // @ts-ignore
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

                // Get spellcasting ability
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
                        } catch (_e) { }
                    }
                } catch (err) { console.error('Error resolving class/spellcasting:', err); }
                computed.spellcastingAbility = spellcastingAbility;
            }

            return {
                id: actor.id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                systemId: 'shadowdark',
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

        if (actorData) {
            const abilities = actorData.system.abilities || actorData.system.stats || {};
            const derived = {
                ...this.calculateAttacks(actorData, abilities),
                ...this.categorizeInventory(actorData, abilities)
            };
            actorData.derived = derived;
        }

        return actorData;
    }

    async getSystemData(client: any): Promise<any> {
        return await client.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results = {
                classes: [] as any[],
                ancestries: [] as any[],
                backgrounds: [] as any[],
                languages: [] as any[],
                titles: {}
            };

            for (const pack of packs) {
                // @ts-ignore
                if (pack.documentName !== 'Item') continue;
                // @ts-ignore
                if (!pack.index.size) await pack.getIndex();
                // @ts-ignore
                const index = pack.index;

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
                // Deep Fetch for Titles
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

    // ... existing normalizeActorData below ...

    normalizeActorData(actor: any): ActorSheetData {
        const s = actor.system;
        const classItem = (actor.items || []).find((i: any) => i.type === 'Class');

        // Shadowdark Schema:
        // system.attributes.hp: { value, max, base, bonus }
        // system.attributes.ac: { value }
        // system.abilities: { str: { mod, ... }, ... }

        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = s.attributes?.ac?.value || 10;

        const abilities = s.abilities || {};

        // Resolve helper for items
        const findItemName = (type: string) => {
            // @ts-ignore
            const item = (actor.items || []).find((i: any) => i.type === type);
            return item ? item.name : null;
        };

        // Shadowdark stores class/ancestry sometimes as links in system, but we might prefer the Item name if it exists on the actor
        const className = s.class || s.details?.class || findItemName('class') || '';
        const ancestryName = s.ancestry || s.details?.ancestry || findItemName('ancestry') || '';
        const backgroundName = s.background || s.details?.background || findItemName('background') || '';

        const sheetData: ActorSheetData = {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            hp: { value: hp.value, max: hp.max },
            ac: ac,
            attributes: abilities,
            stats: abilities,
            items: actor.items || [],
            level: {
                value: s.level?.value || 1,
                xp: s.level?.xp || 0,
                // User requirement: Display as "value / 10" (or max)
                next: s.level?.xp_max || 10
            },
            details: {
                alignment: (s.alignment || s.details?.alignment) ? ((s.alignment || s.details?.alignment).charAt(0).toUpperCase() + (s.alignment || s.details?.alignment).slice(1)) : 'Neutral',
                background: backgroundName,
                ancestry: ancestryName,
                class: className,
                deity: s.deity,
                languages: s.languages || [],
                classLanguages: classItem?.system?.languages || [],
                biography: s.details?.biography?.value || s.biography || '',
                notes: s.notes || s.details?.notes?.value || ''
            },
            luck: s.luck,
            coins: s.coins,
            effects: actor.effects || [],
            computed: actor.computed,
            choices: {
                alignments: actor.systemConfig?.ALIGNMENTS ? Object.values(actor.systemConfig.ALIGNMENTS) : ['Lawful', 'Neutral', 'Chaotic'],
                ancestries: [], // Placeholder, populate if cached or passed
                backgrounds: [] // Placeholder
            },
            derived: {
                ...this.calculateAttacks(actor, abilities),
                ...this.categorizeInventory(actor, abilities)
            }
        };

        // Title Resolution

        if (classItem && classItem.system?.titles && Array.isArray(classItem.system.titles)) {
            // Find the highest title level <= current character level
            const currentLevel = sheetData.level?.value || 0;
            const validTitles = classItem.system.titles.filter((t: any) => t.level <= currentLevel);
            // Sort by level descending
            validTitles.sort((a: any, b: any) => b.level - a.level);

            if (validTitles.length > 0) {
                if (sheetData.details) sheetData.details.title = validTitles[0].name;
            }
        }

        return sheetData;
    }

    private categorizeInventory(actor: any, abilities: any) {
        const equipped: any[] = [];
        const carried: any[] = [];
        const stashed: any[] = [];
        let totalSlots = 0;

        const items = actor.items || [];

        // Sort items alphebetically first
        const sortedItems = [...items].sort((a: any, b: any) => a.name.localeCompare(b.name));

        sortedItems.forEach((item: any) => {
            // Skip non-inventory items if needed, but Shadowdark usually treats everything as Items
            // Actually, we usually want to exclude Classes, Ancestries, etc. from "Carried"
            // But let's follow the sheet logic: "Weapon", "Armor", "Basic", "Potion", "Scroll", "Wand", "Gem", "Treasure"
            const type = item.type;
            const system = item.system || {};

            // Allow generic items too if they have slots?
            // Existing sheet checks strict types for some sections.
            // Let's use a broad filter for now, or match the sheet exactly.
            // Sheet uses: ['Weapon', 'Armor', 'Basic', 'Potion', 'Scroll', 'Wand'] for carried/stashed
            // But generic object check is safer.

            const slots = calculateItemSlots(item);

            if (system.equipped) {
                equipped.push({ ...item, derived: { ...item.derived, slots } });
                // Equipped items usually don't take slots in some games, but Shadowdark?
                // Rules: "Items you wear or carry count". Equipped Armor usually takes slots. 
                // Let's verify existing sheet logic. Sheet sums slots for ALL items where !stashed.
                // So Equipped DOES count.
                if (!system.stashed) totalSlots += slots;
            } else if (system.stashed) {
                stashed.push({ ...item, derived: { ...item.derived, slots } });
                // Stashed items do NOT count towards slots.
            } else {
                // Carried (Not Equipped, Not Stashed)
                // Filter out non-tangible items explicitly
                const excludedTypes = ['Class', 'Ancestry', 'Background', 'Language', 'Talent', 'Spell', 'Effect', 'Deity', 'Title', 'Feature', 'Boon'];
                // Check if type is excluded (case-insensitive just in case)
                const isExcluded = excludedTypes.some(t => t.toLowerCase() === type.toLowerCase());

                if (!isExcluded) {
                    carried.push({ ...item, derived: { ...item.derived, slots } });
                    totalSlots += slots;
                }
            }
        });

        const maxSlots = calculateMaxSlots(actor);

        return {
            inventory: {
                equipped,
                carried,
                stashed,
                slots: {
                    current: totalSlots,
                    max: maxSlots
                }
            }
        };
    }

    private calculateAttacks(actor: any, abilities: any) {
        const melee: any[] = [];
        const ranged: any[] = [];

        const items = actor.items || [];
        const strMod = abilities.STR?.mod ?? abilities.str?.mod ?? 0;
        const dexMod = abilities.DEX?.mod ?? abilities.dex?.mod ?? 0;

        items.forEach((item: any) => {
            if (item.type !== 'Weapon' || !item.system?.equipped) return;

            // Attack Bonus Calculation
            const isFinesse = item.system?.properties?.some((p: any) => typeof p === 'string' && p.toLowerCase().includes('finesse'));
            const isThrown = item.system?.properties?.some((p: any) => typeof p === 'string' && p.toLowerCase().includes('thrown'));
            const isRangedType = item.system?.type === 'ranged';
            const hasRange = item.system?.range === 'near' || item.system?.range === 'far';

            // Base Bonus
            // let bonus = 0;
            const itemBonus = item.system?.bonuses?.attackBonus || 0;

            // Damage String
            const damage = item.system?.damage?.value || `${item.system?.damage?.numDice || 1}${item.system?.damage?.oneHanded || 'd4'}`;

            // Melee Logic
            if (item.system?.type === 'melee') {
                const meleeBonus = (isFinesse ? Math.max(strMod, dexMod) : strMod) + itemBonus;
                melee.push({
                    ...item,
                    derived: {
                        toHit: meleeBonus >= 0 ? `+${meleeBonus}` : `${meleeBonus}`,
                        damage: damage,
                        isFinesse
                    }
                });
            }

            // Ranged Logic (includes Thrown melees)
            if (isRangedType || hasRange || (item.system?.type === 'melee' && isThrown)) {
                // Ranged always uses DEX for Shadowdark unless specified otherwise, but thrown is usually Str/Dex? 
                // Shadowdark Rules: Ranged is DEX. Finesse/Thrown usually implies choice or Dex. 
                // Let's stick to existing logic: Ranged = Dex.

                const rangedBonus = dexMod + itemBonus;
                ranged.push({
                    ...item,
                    derived: {
                        toHit: rangedBonus >= 0 ? `+${rangedBonus}` : `${rangedBonus}`,
                        damage: damage,
                        range: item.system?.range
                    }
                });
            }
        });

        return {
            attacks: {
                melee: melee.sort((a, b) => a.name.localeCompare(b.name)),
                ranged: ranged.sort((a, b) => a.name.localeCompare(b.name))
            }
        };
    }

    getRollData(actor: any, type: string, key: string, options: any = {}): { formula: string; type: string; label: string } | null {
        // Options: abilityBonus, itemBonus, talentBonus, rollingMode, advantageMode
        const advMode = options.advantageMode || 'normal';
        let dice = '1d20';
        if (advMode === 'advantage') dice = '2d20kh1';
        if (advMode === 'disadvantage') dice = '2d20kl1';

        if (type === 'ability') {
            // Options already contains the overridden bonus from the dialog if passed
            // But we should verify. The dialog passes 'abilityBonus' which includes the stat mod.
            // If options.abilityBonus is present, use it directly as the total mod.
            // Otherwise, fetch from actor.

            let mod = 0;
            if (options.abilityBonus !== undefined) {
                mod = Number(options.abilityBonus);
            } else {
                const abilities = actor.system.abilities;
                if (abilities && abilities[key]) {
                    mod = abilities[key].mod;
                }
            }

            // Add talent bonus if present
            if (options.talentBonus) mod += Number(options.talentBonus);

            const sign = mod >= 0 ? '+' : '';
            return {
                formula: `${dice} ${sign} ${mod}`,
                type: 'ability',
                label: `${key.toUpperCase().replace('ABILITY', '')} Check`
            };
        }

        if (type === 'item') {
            const item = (actor.items || []).find((i: any) => i._id === key || i.id === key);

            if (item) {
                let totalBonus = 0;
                let label = '';

                if (item.type === 'Spell') {
                    // Spell Casting
                    label = `Cast ${item.name}`;
                    // If options provided, trust them
                    if (options.abilityBonus !== undefined) {
                        totalBonus += Number(options.abilityBonus);
                    } else {
                        // Fallback logic
                        const statKey = item.system?.ability || 'int';
                        totalBonus += actor.system.abilities?.[statKey]?.mod || 0;
                    }
                } else if (item.type === 'Weapon') {
                    // Attack
                    label = `${item.name} Attack`;

                    if (options.abilityBonus !== undefined && options.itemBonus !== undefined) {
                        totalBonus = Number(options.abilityBonus) + Number(options.itemBonus);
                    } else {
                        // Fallback logic
                        const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                        const isRanged = item.system?.type === 'ranged' || item.system?.range === 'near' || item.system?.range === 'far';

                        const str = actor.system.abilities?.str?.mod || 0;
                        const dex = actor.system.abilities?.dex?.mod || 0;
                        const itemBonus = item.system?.bonuses?.attackBonus || 0;

                        let mod = 0;
                        if (isRanged) {
                            mod = dex;
                        } else if (isFinesse) {
                            mod = Math.max(str, dex);
                        } else {
                            mod = str;
                        }
                        totalBonus = mod + itemBonus;
                    }
                }

                // Add Talent Bonus
                if (options.talentBonus) totalBonus += Number(options.talentBonus);

                const sign = totalBonus >= 0 ? '+' : '';
                return {
                    formula: `${dice} ${sign} ${totalBonus}`,
                    type: item.type === 'Spell' ? 'spell' : 'attack',
                    label: label
                };
            }
        }
        return null;
    }
}
