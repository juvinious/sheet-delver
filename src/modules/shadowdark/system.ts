import { SystemAdapter, ActorSheetData } from '../core/interfaces';
import { calculateItemSlots, calculateMaxSlots } from './rules';

export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';

    theme = {
        bg: 'bg-neutral-900',
        panelBg: 'bg-neutral-800',
        text: 'text-neutral-200',
        accent: 'text-amber-500',
        button: 'bg-amber-700 hover:bg-amber-600',
        headerFont: 'font-serif tracking-widest',
        success: 'bg-green-800 hover:bg-green-700'
    };

    componentStyles = {
        chat: {
            container: "bg-white border-2 border-black",
            header: "text-black text-sm font-bold uppercase mb-4 border-b-2 border-black pb-2 font-serif tracking-widest",
            msgContainer: (isRoll: boolean) => `p-3 border-2 border-black mb-2 shadow-sm ${isRoll ? 'bg-neutral-100' : 'bg-white'}`,
            user: "font-serif font-bold text-black text-lg",
            time: "text-[10px] uppercase font-bold text-neutral-400 tracking-widest",
            flavor: "text-sm italic text-neutral-600 mb-1 font-serif",
            content: "text-sm text-black font-serif leading-relaxed messages-content [&_img]:max-w-[48px] [&_img]:max-h-[48px] [&_img]:inline-block [&_img]:border-2 [&_img]:border-black [&_img]:grayscale [&_img]:contrast-125",
            rollResult: "mt-2 bg-white text-black p-2 text-center border-2 border-black",
            rollFormula: "text-[10px] uppercase tracking-widest text-neutral-500",
            rollTotal: "text-2xl font-bold font-serif",
            button: "inline-flex items-center gap-1 bg-white hover:bg-black group border-2 border-black px-2 py-0.5 text-xs font-bold text-black hover:text-white transition-colors cursor-pointer my-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-y-[2px]",
            buttonText: "uppercase font-sans tracking-widest",
            buttonValue: "font-serif font-bold group-hover:text-white"
        },
        diceTray: {
            container: "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 rounded-lg",
            button: "bg-white text-black border-2 border-black font-serif font-bold hover:bg-black hover:text-white hover:-translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-y-0 active:shadow-none",
            input: "bg-white border-2 border-black text-black placeholder-neutral-400 font-serif focus:ring-0"
        }
    };

    match(actor: any): boolean {
        return actor.systemId === 'shadowdark' || actor.system?.attributes?.hp?.base !== undefined; // Heuristic fallback if systemId missing, but usually systemId is there.
    }

    async getActor(client: any, actorId: string): Promise<any> {
        const baseUrl = client.url;

        const actorData = await client.evaluate(async ({ actorId, baseUrl }: any) => {

            // Helper for URL resolution
            const resolveUrl = (url: string) => {
                if (!url) return url;
                if (url.startsWith('http') || url.startsWith('https') || url.startsWith('data:')) return url;
                // Remove leading slash if present
                const cleanPath = url.startsWith('/') ? url.slice(1) : url;
                // Remove trailing slash from base
                const cleanBase = baseUrl && baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                return `${cleanBase}/${cleanPath}`;
            };

            try {
                // @ts-ignore
                if (!window.game) return { error: "window.game is undefined", state: document.readyState };
                // @ts-ignore
                if (!window.game.ready) return { error: "window.game.ready is false", state: "not-ready" };
                // @ts-ignore
                if (!window.game.actors) return { error: "window.game.actors is undefined", state: "missing-actors" };

                // @ts-ignore
                const actor = window.game.actors.get(actorId);
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
                        img: resolveUrl(i.img),
                        system: (typeof i.system?.toObject === 'function' ? i.system.toObject() : i.system) || {},
                        uuid: `Actor.${actorId}.Item.${i.id}`,
                        effects: i.effects ? Array.from(i.effects).map((e: any) => ({
                            _id: e.id,
                            name: e.name,
                            changes: e.changes,
                            disabled: e.disabled,
                            icon: e.icon
                        })) : []
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
                            img: resolveUrl(e.img),
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
                            img: resolveUrl(e.img),
                            disabled: e.disabled,
                            changes: e.changes
                        }));
                    }
                } catch (err) {
                    console.error('Error processing effects:', err);
                }

                // --- DERIVED STATS ---
                const levelVal = actor.system.level?.value !== undefined ? Number(actor.system.level.value) : 1;
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
                        // --- BROWSER CONTEXT ---
                        // The following code runs inside the browser!
                        // We have access to the real ActorSD instance here.

                        const abilities = (typeof actor.getCalculatedAbilities === 'function') ? actor.getCalculatedAbilities() : (actor.system.abilities || {});
                        const keys = Object.keys(abilities);
                        const safeAbilities: any = {};

                        // 1. Sanitize Data (Polyfill missing bonus)
                        // We modify the actor's system data in memory to ensure the API call doesn't crash/fail
                        if (actor.type === 'Player' && actor.system?.abilities) {
                            for (const key of keys) {
                                if (actor.system.abilities[key] && actor.system.abilities[key].bonus === undefined) {
                                    actor.system.abilities[key].bonus = 0;
                                }
                            }
                        }

                        // 2. Strict API Usage
                        for (const key of keys) {
                            const stat = abilities[key];
                            let finalMod = stat.mod ?? 0;

                            if (typeof actor.abilityModifier === 'function') {
                                try {
                                    const apiMod = actor.abilityModifier(key);
                                    if (apiMod !== undefined && apiMod !== null) {
                                        finalMod = apiMod;
                                    }
                                } catch (e) {
                                    console.error(`[Browser] Error calculating modifier for ${key}:`, e);
                                }
                            }

                            // Fallback: If API failed to return a number, try local calculation?
                            // User requested STRICT API usage. If API returns 0, we trust it (or fixed the input so it's correct).
                            // Note: If we really want to be safe, we could check if API mod is 0 but base is e.g. 18.
                            // But let's trust the API with sanitized data.

                            safeAbilities[key] = { ...stat, mod: finalMod };
                        }
                        computed.abilities = safeAbilities;

                    } catch (err) { console.error('Error calculating Abilities in Browser:', err); computed.abilities = actor.system.abilities || {}; }

                    // Get spellcasting ability
                    let spellcastingAbility = "";
                    try {
                        const characterClass = actor.items.find((i: any) => i.type === "Class" || i.type === "class");
                        if (characterClass) {
                            spellcastingAbility = characterClass.system.spellcasting?.ability?.toUpperCase() || "";
                        }
                    } catch (err) { console.error('Error resolving spellcasting:', err); }
                    computed.spellcastingAbility = spellcastingAbility;

                    // Resolve UUIDs for Class/Ancestry/Background names if strict items missing
                    // This ensures the dashboard displays names like "Wizard" instead of "Compendium..."
                    try {
                        const resolveName = async (field: any) => {
                            if (typeof field === 'string' && (field.startsWith('Compendium') || field.startsWith('Actor') || field.startsWith('Item'))) {
                                try {
                                    // @ts-ignore
                                    const item = await fromUuid(field);
                                    return item?.name;
                                } catch { }
                            }
                            return undefined;
                        };

                        computed.resolvedNames = {
                            class: await resolveName(actor.system.class),
                            ancestry: await resolveName(actor.system.ancestry),
                            background: await resolveName(actor.system.background)
                        };

                        // Fallback: If we resolved a class UUID, maybe we can get spellcasting from it too if we missed it earlier
                        if (!computed.spellcastingAbility && computed.resolvedNames.class && typeof actor.system.class === 'string') {
                            try {
                                // @ts-ignore
                                const classItem = await fromUuid(actor.system.class);
                                if (classItem) {
                                    computed.spellcastingAbility = classItem.system.spellcasting?.ability?.toUpperCase() || "";
                                }
                            } catch { }
                        }

                    } catch (e) {
                        console.error('Error resolving UUID names:', e);
                        computed.resolvedNames = {};
                    }
                }

                return {
                    id: actor.id,
                    name: actor.name,
                    type: actor.type,
                    img: resolveUrl(actor.img),
                    systemId: 'shadowdark',
                    system: actor.system,
                    items: items,
                    effects: effects,
                    computed: computed,
                    // @ts-ignore
                    currentUser: window.game.user ? window.game.user.name : 'Unknown',
                    // @ts-ignore
                    systemConfig: window.game.shadowdark?.config || window.game.system?.config || {}
                };
            } catch (err: any) {
                return { error: err.message, stack: err.stack, state: document.readyState };
            }
        }, { actorId, baseUrl });

        if (actorData && actorData.system) {
            const abilities = actorData.system.abilities || actorData.system.stats || {};
            const derived = {
                ...this.calculateAttacks(actorData, abilities),
                ...this.categorizeInventory(actorData)
            };
            actorData.derived = derived;
        }

        return actorData;
    }

    async getSystemData(client: any): Promise<any> {
        return await client.evaluate(async () => {
            // @ts-ignore
            if (!window.game || !window.game.system) return null;
            // @ts-ignore
            const s = window.game.system;
            // @ts-ignore
            const packs = window.game.packs.contents;

            const results = {
                id: s.id,
                title: s.title,
                version: s.version,
                url: s.url,
                manifest: s.manifest,
                documentTypes: s.documentTypes,
                template: s.template,

                classes: [] as any[],
                ancestries: [] as any[],
                backgrounds: [] as any[],
                languages: [] as any[],
                deities: [] as any[],
                patrons: [] as any[],
                spells: [] as any[],
                talents: [] as any[],
                titles: {},
                PREDEFINED_EFFECTS: {}
            };

            // @ts-ignore
            const sdConfig = (typeof CONFIG !== 'undefined' ? CONFIG.SHADOWDARK : null) || window.game?.shadowdark?.config;

            console.log('[DEBUG] SD Config found:', !!sdConfig);

            if (sdConfig?.PREDEFINED_EFFECTS) {
                // @ts-ignore
                results.PREDEFINED_EFFECTS = sdConfig.PREDEFINED_EFFECTS;
            }

            for (const pack of packs) {
                // @ts-ignore
                if (pack.documentName !== 'Item') continue;

                // Index with robust fields
                // @ts-ignore
                const index = await pack.getIndex({ fields: ['type', 'system.tier', 'system.class', 'system.spellcasting', 'system.patron', 'system.alignment'] });

                // Helper for case-insensitive check
                const filterType = (type: string) => index.filter((i: any) => i.type && i.type.toLowerCase() === type.toLowerCase());

                // Index Classes
                const classIndex = filterType('class');
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

                        // Index Titles directly from Class items
                        if (doc.system?.titles) {
                            // @ts-ignore
                            results.titles[doc.name] = doc.system.titles;
                        }
                    }
                }

                // Index Ancestries
                const ancestryIndex = filterType('ancestry');
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

                // Backgrounds
                // @ts-ignore
                results.backgrounds.push(...filterType('background').map(i => ({ name: i.name, uuid: `Compendium.${pack.collection}.Item.${i._id}` })));

                // Talents (Generic or specific)
                // @ts-ignore
                results.talents.push(...filterType('talent').map(i => ({ name: i.name, uuid: `Compendium.${pack.collection}.Item.${i._id}`, img: i.img })));

                // Index Languages
                const langIndex = filterType('language');
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

                // Index Deities
                const deityIndex = filterType('deity');
                for (const d of deityIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(d._id);
                    if (doc) {
                        // @ts-ignore
                        results.deities.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${d._id}`,
                            alignment: doc.system?.alignment || 'neutral'
                        });
                    }
                }

                // Index Patrons
                const patronIndex = filterType('patron');
                for (const p of patronIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(p._id);
                    if (doc) {
                        // @ts-ignore
                        results.patrons.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${p._id}`,
                            description: (typeof doc.system?.description === 'string' ? doc.system.description : doc.system?.description?.value) || '',
                            boonTable: doc.system?.boonTable || ''
                        });
                    }
                }

                // Index Spells
                const spellIndex = filterType('spell');
                results.spells.push(...spellIndex.map((s: any) => ({
                    name: s.name,
                    uuid: `Compendium.${pack.collection}.Item.${s._id}`,
                    tier: s.system?.tier || 0,
                    class: s.system?.class || [],
                    img: s.img,
                    description: ''
                })));
            }
            return results;
        });
    }

    async getPredefinedEffects(client: any): Promise<any[]> {
        return await client.evaluate(() => {
            // @ts-ignore
            const effects = CONFIG.statusEffects || [];
            return effects.map((e: any) => ({
                id: e.id, // Shadowdark usually uses 'blinded' etc. as ID
                label: e.label, // Name of the condition
                icon: e.icon,
                changes: e.changes
            }));
        });
    }

    // ... existing normalizeActorData below ...

    // --- Active Effect Application ---
    private applyEffects(actor: any, systemData: any) {
        const effects = actor.effects || [];
        if (!effects.length) return;

        // Constants for Effect Modes
        const MODES = {
            CUSTOM: 0,
            MULTIPLY: 1,
            ADD: 2,
            DOWNGRADE: 3,
            UPGRADE: 4,
            OVERRIDE: 5
        };

        // Helper to get nested property
        const getProperty = (obj: any, path: string) => {
            return path.split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
        };

        // Helper to set nested property
        const setProperty = (obj: any, path: string, value: any) => {
            const parts = path.split('.');
            let current = obj;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;
        };

        // Sort effects? Usually unnecessary for simple stats unless priority matters.
        // Apply effects
        for (const effect of effects) {
            if (effect.disabled) continue;

            const changes = effect.changes || [];
            for (const change of changes) {
                const { key, value, mode } = change;
                if (!key) continue;

                // Handle "system." prefix being optional or distinct based on how the sheet treats it.
                // In Foundry, "system.abilities.str" is common. 
                // Our `systemData` IS the `system` object, so we strip "system." from the key if present.
                let path = key;
                if (path.startsWith('system.')) {
                    path = path.substring(7);
                }

                // Handle Shorthands (Shadowdark Specific)
                const SHORTHANDS: Record<string, string> = {
                    'str.bonus': 'abilities.str.bonus',
                    'dex.bonus': 'abilities.dex.bonus',
                    'con.bonus': 'abilities.con.bonus',
                    'int.bonus': 'abilities.int.bonus',
                    'wis.bonus': 'abilities.wis.bonus',
                    'cha.bonus': 'abilities.cha.bonus',
                    'str.value': 'abilities.str.value',
                    'dex.value': 'abilities.dex.value',
                    'con.value': 'abilities.con.value',
                    'int.value': 'abilities.int.value',
                    'wis.value': 'abilities.wis.value',
                    'cha.value': 'abilities.cha.value',
                    'hp.max': 'attributes.hp.max',
                    'hp.bonus': 'attributes.hp.bonus'
                };

                if (SHORTHANDS[path]) {
                    path = SHORTHANDS[path];
                }

                const currentVal = Number(getProperty(systemData, path)) || 0;
                let changeVal = Number(value) || 0;
                // NOTE: `value` could be a formula in Foundry (e.g. "@abilities.str.mod").
                // Evaluating strings is dangerous/complex without a full parser. 
                // For now, we support numeric literals. If NaN, we skip (or try strict string for Override).

                if (isNaN(changeVal) && mode !== MODES.OVERRIDE) {
                    // Try to parse basic string? Or just simple check?
                    // If value is "1", Number("1") works. 
                    // If value is "@something", Number is NaN.
                    // We will safely ignore complex formulas for now to prevent crashes.
                    continue;
                }

                let finalVal = currentVal;

                switch (Number(mode)) {
                    case MODES.ADD:
                        finalVal = currentVal + changeVal;
                        break;
                    case MODES.MULTIPLY:
                        finalVal = currentVal * changeVal;
                        break;
                    case MODES.OVERRIDE:
                        // Allow string overrides
                        finalVal = isNaN(changeVal) ? value : changeVal;
                        break;
                    case MODES.UPGRADE:
                        finalVal = Math.max(currentVal, changeVal);
                        break;
                    case MODES.DOWNGRADE:
                        finalVal = Math.min(currentVal, changeVal);
                        break;
                }

                console.log(`[ShadowdarkAdapter] Applying Change: ${key} (${mode}) ${currentVal} -> ${finalVal}`);
                setProperty(systemData, path, finalVal);
            }
        }
    }

    normalizeActorData(actor: any): ActorSheetData {
        // Clone system data to apply effects without mutating raw data
        const s = typeof structuredClone === 'function'
            ? structuredClone(actor.system)
            : JSON.parse(JSON.stringify(actor.system));

        // Apply Active Effects to the cloned system data
        // this.applyEffects(actor, s); // REDUNDANT: Foundry handles this if transfer: true

        const classItem = (actor.items || []).find((i: any) => i.type === 'Class');

        // Shadowdark Schema:
        // system.attributes.hp: { value, max, base, bonus }
        // system.attributes.ac: { value }
        // system.abilities: { str: { mod, ... }, ... }

        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = s.attributes?.ac?.value || 10;

        // Helper to ensure modifiers are calculated
        const ensureMod = (stat: any) => {
            if (!stat) return { value: 10, mod: 0, base: 10, bonus: 0 };

            // Recalculate value from base + bonus to ensure effects are applied
            // If value is present (from Foundry prep), trust it. Otherwise calc from base + bonus.
            let val = Number(stat.value);
            if (isNaN(val)) {
                val = Number(stat.base || 10) + Number(stat.bonus || 0);
            }

            const mod = Math.floor((val - 10) / 2);
            // Return raw props but ensure value/mod are synced
            return { ...stat, value: val, mod };
        };

        const abilities: any = {};
        if (s.abilities) {
            for (const key of Object.keys(s.abilities)) {
                abilities[key] = ensureMod(s.abilities[key]);
            }
        } else {
            // Fallback default
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
                abilities[k] = { value: 10, mod: 0, base: 10 };
            });
        }

        // Resolve helper for items
        const findItemName = (type: string, uuidField?: string) => {
            // 1. Try finding by Type (Case-Insensitive)
            // @ts-ignore
            const itemByType = (actor.items || []).find((i: any) => i.type.toLowerCase() === type.toLowerCase());
            if (itemByType) return itemByType.name;

            // 2. If we have a UUID in the system field, look for an item with that UUID (or Source ID)
            if (uuidField && typeof uuidField === 'string' && uuidField.length > 0) {
                // @ts-ignore
                const itemByUuid = (actor.items || []).find((i: any) => i.uuid === uuidField || i.flags?.core?.sourceId === uuidField || i.id === uuidField);
                if (itemByUuid) return itemByUuid.name;
            }

            return null;
        };

        // Shadowdark stores class/ancestry sometimes as links in system, but we might prefer the Item name if it exists on the actor
        // We prioritize findItemName because s.class/s.ancestry might be IDs (from our new linking logic)
        // Ensure we match the Item Type casing (usually TitleCase)
        // We also check s.computed?.resolvedNames which were fetched async in getActor

        // Fix: computed is on the root actor object, not inside 'system' (s)
        const resolved = actor.computed?.resolvedNames || {};

        const className = findItemName('Class', s.class || s.details?.class) || resolved.class || s.class || s.details?.class || '';
        const ancestryName = findItemName('Ancestry', s.ancestry || s.details?.ancestry) || resolved.ancestry || s.ancestry || s.details?.ancestry || '';
        const backgroundName = findItemName('Background', s.background || s.details?.background) || resolved.background || s.background || s.details?.background || '';

        const sheetData: ActorSheetData = {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            system: s, // Include raw system data for bindings
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
                ...this.categorizeInventory(actor)
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

    async postCreate(client: any, actorId: string, sourceData: any): Promise<void> {
        if (!client.page) return;

        await client.page.evaluate(async ({ actorId, sourceData }: { actorId: string, sourceData: any }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor || !actor.system) return;

            const updates: any = {};

            // Helper to link fields by TYPE (Robust Fallback)
            const linkByType = (field: string, type: string) => {
                // @ts-ignore
                const item = actor.items.find((i: any) => i.type === type || i.type === type.toLowerCase() || i.type === type.charAt(0).toUpperCase() + type.slice(1));

                if (item) {
                    updates[`system.${field}`] = item.uuid;
                } else {
                    const sourceUuid = sourceData.system?.[field];
                    if (sourceUuid && typeof sourceUuid === 'string') {
                        // @ts-ignore
                        const match = actor.items.find((i: any) => i.flags?.core?.sourceId === sourceUuid);
                        if (match) updates[`system.${field}`] = match.uuid;
                    }
                }
            };

            linkByType('class', 'Class');
            linkByType('ancestry', 'Ancestry');
            linkByType('background', 'Background');
            linkByType('patron', 'Patron');

            if (sourceData.system?.alignment) updates['system.alignment'] = sourceData.system.alignment;
            if (sourceData.system?.deity) updates['system.deity'] = sourceData.system.deity;

            if (sourceData.system?.attributes?.hp) {
                const hp = sourceData.system.attributes.hp;
                if (hp.value !== undefined) updates['system.attributes.hp.value'] = hp.value;
                if (hp.max !== undefined) updates['system.attributes.hp.base'] = hp.max;
                if (hp.max !== undefined) updates['system.attributes.hp.max'] = hp.max;
            }

            if (sourceData.system?.currency?.gp !== undefined) {
                updates['system.currency.gp'] = sourceData.system.currency.gp;
                // @ts-ignore
                if (actor.system.coins) updates['system.coins.gp'] = sourceData.system.currency.gp;
            }

            if (sourceData.system?.abilities && actor.system?.abilities) {
                const sourceAbilities = sourceData.system.abilities;
                const targetKeys = Object.keys(actor.system.abilities);

                for (const sourceKey of Object.keys(sourceAbilities)) {
                    const targetKey = targetKeys.find(k => k.toLowerCase() === sourceKey.toLowerCase());
                    if (targetKey) {
                        const stat = sourceAbilities[sourceKey];
                        if (stat.value !== undefined) {
                            updates[`system.abilities.${targetKey}.value`] = stat.value;
                            updates[`system.abilities.${targetKey}.base`] = stat.value;
                        }
                    }
                }
            }

            if (sourceData.system?.level?.value !== undefined) {
                // @ts-ignore
                if (actor.system.level?.value !== sourceData.system.level.value) {
                    updates['system.level.value'] = sourceData.system.level.value;
                }
            }

            if (Object.keys(updates).length > 0) {
                await actor.update(updates);
            }
        }, { actorId, sourceData });
    }

    private categorizeInventory(actor: any) {
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


    public resolveActorNames(actor: any, cache: any): void {
        // Ensure computed exists
        if (!actor.computed) actor.computed = {};
        if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};

        const resolve = (uuid: string, current: string) => {
            if (current) return current; // Already resolved browser-side
            if (!uuid || typeof uuid !== 'string') return undefined;

            // 1. Try resolving from local items (Actor.ID.Item.ID)
            if (uuid.startsWith('Actor.')) {
                // Check if it's THIS actor's item
                // UUID format: Actor.<ActorID>.Item.<ItemID>
                const parts = uuid.split('.');
                const itemId = parts[3]; // Actor, ID, Item, ID
                if (itemId) {
                    // We can try to find it in the actor's items list if available
                    // The 'actor' object passed here usually has 'items' populated by getActors()
                    const item = (actor.items || []).find((i: any) => i.id === itemId || i._id === itemId);
                    if (item) return item.name;
                }
            }

            // 2. Try Compendium Cache
            return cache.getName(uuid);
        };

        if (actor.system) {
            actor.computed.resolvedNames.class = resolve(actor.system.class, actor.computed.resolvedNames.class);
            actor.computed.resolvedNames.ancestry = resolve(actor.system.ancestry, actor.computed.resolvedNames.ancestry);
            actor.computed.resolvedNames.background = resolve(actor.system.background, actor.computed.resolvedNames.background);
        }
    }
}
