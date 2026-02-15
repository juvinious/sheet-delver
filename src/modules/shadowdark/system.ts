import { SystemAdapter, ActorSheetData } from '../core/interfaces';
import { calculateItemSlots, calculateMaxSlots, calculateCoinSlots, calculateGemSlots, isSpellcaster, isClassSpellcaster, shouldShowSpellsTab, canUseMagicItems } from './rules';
import { logger } from '../../core/logger';
import { dataManager } from './data/DataManager';
import { SYSTEM_PREDEFINED_EFFECTS } from './data/talent-effects';
import { shadowdarkTheme } from './ui/themes/shadowdark';
import { applyItemDataOverrides, getItemSpells } from './api/item-properties';

export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';
    private systemConfig: any = null;
    private readonly CACHE_NS = 'shadowdark';
    private readonly CACHE_KEY = 'system-config';

    theme = {
        bg: 'bg-neutral-900',
        panelBg: 'bg-neutral-800',
        text: 'text-neutral-200',
        accent: 'text-amber-500',
        button: 'bg-amber-700 hover:bg-amber-600',
        headerFont: 'font-serif tracking-widest',
        success: 'bg-green-800 hover:bg-green-700'
    };



    componentStyles = shadowdarkTheme;

    match(actor: any): boolean {
        // Broaden heuristic to protect against partial system object or missing systemId
        const hasShadowdarkType = ['player', 'character', 'npc'].includes(actor.type?.toLowerCase());
        const hasShadowdarkSystem = actor.system?.attributes?.hp !== undefined ||
            actor.system?.abilities?.str !== undefined;

        return actor.systemId === 'shadowdark' || (hasShadowdarkType && hasShadowdarkSystem);
    }

    async getActor(client: any, actorId: string): Promise<any> {
        const baseUrl = client.url;
        logger.debug(`[ShadowdarkAdapter] getActor baseUrl: ${baseUrl}`);

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
                logger.debug(`[ShadowdarkAdapter] normalizing Actor: ${actor.name} (Type: ${actor.type})`);
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
                const effects: any[] = [];
                try {
                    // Collect all applicable effects
                    // @ts-ignore
                    const allFoundryEffects = [];
                    // @ts-ignore
                    if (typeof actor.allApplicableEffects === 'function') {
                        // @ts-ignore
                        for (const e of actor.allApplicableEffects()) allFoundryEffects.push(e);
                    } else if (actor.effects) {
                        // @ts-ignore
                        const actorEffects = actor.effects.contents || Array.from(actor.effects || []);
                        for (const e of actorEffects) allFoundryEffects.push(e);
                    }

                    // Also crawl items for any effects NOT already captured (just in case)
                    // @ts-ignore
                    const itemsToCrawl = actor.items?.contents || Array.from(actor.items || []);
                    for (const item of itemsToCrawl) {
                        const itemEffects = item.effects?.contents || Array.from(item.effects || []);
                        for (const e of itemEffects) {
                            const eId = e.id || e._id;
                            const isDuplicate = allFoundryEffects.some(ae => {
                                const aeId = ae.id || ae._id;
                                if (aeId === eId) return true;
                                if (ae.name === (e.name || e.label) && ae.origin && ae.origin.includes(item.id || item._id)) return true;
                                return false;
                            });

                            if (!isDuplicate) {
                                if (item.name) (e as any)._parentName = item.name;
                                allFoundryEffects.push(e);
                            }
                        }
                    }

                    for (const e of allFoundryEffects) {
                        const eId = e.id || e._id;
                        let sourceName = e.sourceName || (e as any)._parentName || "Unknown";

                        // Try to resolve source from parent first if it's an Item
                        if (sourceName === "Unknown" && e.parent && e.parent.documentName === "Item") {
                            sourceName = e.parent.name;
                        }

                        // Try resolving from origin UUID (Slow but robust)
                        if (sourceName === "Unknown" && e.origin) {
                            try {
                                // @ts-ignore
                                const originDoc = await fromUuid(e.origin);
                                if (originDoc) {
                                    if (originDoc.documentName === "Item") {
                                        // If same actor, use item name. If different, use actor name.
                                        if (originDoc.actor && originDoc.actor.id === actor.id) {
                                            sourceName = originDoc.name;
                                        } else {
                                            sourceName = originDoc.actor?.name || actor.name;
                                        }
                                    } else {
                                        sourceName = originDoc.name;
                                    }
                                } else {
                                    // Manually parse origin if fromUuid fails (e.g. Actor ID mismatch)
                                    const parts = e.origin.split('.');
                                    const actorIdx = parts.indexOf('Actor');
                                    const itemIdx = parts.indexOf('Item');
                                    if (actorIdx !== -1 && parts[actorIdx + 1]) {
                                        const originActorId = parts[actorIdx + 1];
                                        if (originActorId === actor.id) {
                                            if (itemIdx !== -1 && parts[itemIdx + 1]) {
                                                const itemId = parts[itemIdx + 1];
                                                // @ts-ignore
                                                const sourceItem = itemsToCrawl.find(it => (it.id || it._id) === itemId);
                                                if (sourceItem) sourceName = sourceItem.name;
                                            }
                                        } else {
                                            sourceName = actor.name; // Fallback to current actor name as per user guidance
                                        }
                                    } else {
                                        sourceName = e.origin;
                                    }
                                }
                            } catch (_err) { /* ignore */ }
                        }

                        // Fallback: Check if ANY item on actor has this effect by ID
                        if (sourceName === "Unknown" || sourceName === "undefined" || sourceName === "null") {
                            // @ts-ignore
                            for (const it of itemsToCrawl) {
                                const itEffects = it.effects?.contents || Array.from(it.effects || []);
                                // @ts-ignore
                                if (itEffects.some((ie: any) => (ie.id || ie._id) === eId)) {
                                    sourceName = it.name;
                                    break;
                                }
                            }
                        }

                        // Final fallbacks from flags or labels
                        if (sourceName === "Unknown" || sourceName === "undefined" || sourceName === "null") {
                            sourceName = e.flags?.shadowdark?.sourceName || e.source || e.origin || "Unknown";
                        }

                        if (sourceName === "Unknown" && e.label && e.label.includes(':')) {
                            sourceName = e.label.split(':')[0].trim();
                        }

                        // Ensure we don't have "undefined" as a string
                        if (sourceName === "undefined" || sourceName === "null") sourceName = "Unknown";

                        // Only deduplicate by UNIQUE ID to allow identical effects from different sources
                        if (effects.some(ef => ef._id === eId)) continue;

                        effects.push({
                            _id: eId,
                            name: e.name || e.label,
                            img: resolveUrl(e.img || e.icon),
                            disabled: !!e.disabled,
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
                            sourceName: sourceName,
                            transfer: e.transfer,
                            statuses: Array.from(e.statuses ?? [])
                        });
                    }
                } catch (err) {
                    console.error('Error processing effects:', err);
                }

                // --- DERIVED STATS ---
                const levelVal = actor.system.level?.value !== undefined ? Number(actor.system.level.value) : 1;
                const xpVal = Number(actor.system.level?.xp) || 0;
                const threshold = Number(actor.system.level?.xp_max) || (Math.max(1, levelVal) * 10);
                const computed: any = {
                    maxHp: (Number(actor.system.attributes?.hp?.base) || 0) + (Number(actor.system.attributes?.hp?.bonus) || 0),
                    xpNextLevel: threshold,
                    levelUp: xpVal >= threshold
                };

                if (actor.type === "Player") {
                    try {
                        computed.ac = (typeof actor.getArmorClass === 'function') ? await actor.getArmorClass() : 10;
                    } catch (err) { logger.error('Error calculating AC:', err); computed.ac = 10; }

                    try {
                        computed.gearSlots = (typeof actor.numGearSlots === 'function') ? actor.numGearSlots() : 10;
                    } catch (err) { logger.error('Error calculating Gear Slots:', err); computed.gearSlots = 10; }


                    // --- UNIFIED SPELLCASTER CHECK ---
                    computed.isSpellCaster = isSpellcaster(actor);
                    computed.canUseMagicItems = canUseMagicItems(actor);
                    computed.showSpellsTab = shouldShowSpellsTab(actor);

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
                    id: actor.id || actor._id,
                    name: actor.name,
                    type: actor.type,
                    img: resolveUrl(actor.img),
                    systemId: 'shadowdark',
                    system: actor.system || {},
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

        if (actorData && !actorData.error) {
            return this.normalizeActorData(actorData, client);
        }

        return actorData;
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
                // For Shadowdark: Show "Ancestry • Class • Level X"
                subtext: ['details.ancestry', 'details.class', 'level.value']
            }
        };
    }

    async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        await this._ensureSystemConfig(client);

        const sysInfo = await client.getSystem();
        const results = this._initializeResults(sysInfo);

        if (options?.minimal) return results;

        try {
            const processedUuids = new Set<string>();

            await this._discoverFromDataManager(results, processedUuids);

            await this._discoverFromSocket(client, results, processedUuids);

            await this._processWorldItems(client, results, processedUuids);

            this._resolveSpellClasses(results);

        } catch (e) {
            logger.error('ShadowdarkAdapter | getSystemData failed:', e);
        }

        return results;
    }

    private async _ensureSystemConfig(client: any) {
        if (this.systemConfig) return;

        try {
            const { persistentCache } = await import('../../core/cache/PersistentCache');
            this.systemConfig = await persistentCache.get(this.CACHE_NS, this.CACHE_KEY);

            if (!this.systemConfig && client.getSystemConfig) {
                logger.info('ShadowdarkAdapter | Fetching official system configuration...');
                const liveConfig = await client.getSystemConfig();
                if (liveConfig && Object.keys(liveConfig).length > 0) {
                    this.systemConfig = liveConfig;
                    await persistentCache.set(this.CACHE_NS, this.CACHE_KEY, liveConfig);
                    logger.info('ShadowdarkAdapter | Official system configuration cached.');
                }
            }
        } catch (e) {
            logger.error('ShadowdarkAdapter | Failed to ensure system config:', e);
        }
    }

    private _initializeResults(sysInfo: any) {
        return {
            id: sysInfo.id,
            title: sysInfo.title,
            version: sysInfo.version,
            config: {
                actorCard: {
                    subtext: ['level.value', 'details.class']
                }
            },
            classes: [] as any[],
            ancestries: [] as any[],
            backgrounds: [] as any[],
            languages: [] as any[],
            deities: [] as any[],
            patrons: [] as any[],
            spells: [] as any[],
            talents: [] as any[],
            titles: {},
            PREDEFINED_EFFECTS: {
                ...SYSTEM_PREDEFINED_EFFECTS,
                ...(this.systemConfig?.PREDEFINED_EFFECTS || {})
            },
        };
    }

    private async _discoverFromDataManager(results: any, processedUuids: Set<string>) {
        if (typeof window !== 'undefined') return;

        try {
            const { dataManager } = await import('./data/DataManager');
            const localDocs = await dataManager.getAllDocuments();

            for (const doc of localDocs) {
                const type = (typeof doc.type === 'string' ? doc.type : '').toLowerCase();
                const uuid = doc.uuid;

                if (!uuid || processedUuids.has(uuid)) continue;
                processedUuids.add(uuid);

                const baseInfo = { name: doc.name, uuid, img: doc.img };

                if (type === 'class') {
                    results.classes.push({
                        ...baseInfo,
                        system: {
                            description: doc.system?.description || "",
                            languages: doc.system?.languages || [],
                            talents: doc.system?.talents || [],
                            talentChoices: doc.system?.talentChoices || [],
                            talentChoiceCount: doc.system?.talentChoiceCount || 0
                        }
                    });
                    if (doc.system?.titles) results.titles[doc.name] = doc.system.titles;
                } else if (type === 'ancestry') {
                    results.ancestries.push({
                        ...baseInfo,
                        system: {
                            description: doc.system?.description || "",
                            languages: doc.system?.languages || [],
                            talents: doc.system?.talents || [],
                            talentChoices: doc.system?.talentChoices || [],
                            talentChoiceCount: doc.system?.talentChoiceCount || 0
                        }
                    });
                } else if (type === 'background') {
                    results.backgrounds.push(baseInfo);
                } else if (type === 'language') {
                    results.languages.push({ ...baseInfo, rarity: (doc.system?.rarity || 'common').toLowerCase() });
                } else if (type === 'deity') {
                    results.deities.push(baseInfo);
                } else if (type === 'patron') {
                    results.patrons.push(baseInfo);
                } else if (type === 'talent') {
                    results.talents.push(baseInfo);
                } else if (type === 'spell') {
                    results.spells.push({
                        ...baseInfo,
                        tier: doc.system?.tier || 0,
                        class: Array.isArray(doc.system?.class) ? doc.system.class : [doc.system?.class].filter(Boolean),
                        duration: doc.system?.duration,
                        range: doc.system?.range
                    });
                }
            }
        } catch (e) {
            logger.error("ShadowdarkAdapter | DataManager discovery failed:", e);
        }
    }

    private async _discoverFromSocket(client: any, results: any, processedUuids: Set<string>) {
        const packs = await client.getAllCompendiumIndices();
        const discoveryTasks: Promise<void>[] = [];

        for (const pack of packs) {
            const metadata = pack.metadata || {};
            const docType = metadata.type || metadata.documentName || metadata.documentClass;
            if (docType !== 'Item') continue;

            const packId = pack.id;
            const index = pack.index || [];

            for (const item of index) {
                const type = (typeof item.type === 'string' ? item.type : '').toLowerCase();
                const uuid = `Compendium.${packId}.Item.${item._id || item.id}`;

                if (processedUuids.has(uuid)) continue;
                processedUuids.add(uuid);

                const baseInfo = { name: item.name, uuid, img: client.resolveUrl(item.img) };

                if (type === 'class') {
                    discoveryTasks.push(this._fetchClassDiscovery(client, uuid, baseInfo, results));
                } else if (type === 'ancestry') {
                    discoveryTasks.push(this._fetchAncestryDiscovery(client, uuid, baseInfo, results));
                } else if (type === 'background') {
                    results.backgrounds.push(baseInfo);
                } else if (type === 'language') {
                    discoveryTasks.push(this._fetchLanguageDiscovery(client, uuid, baseInfo, results));
                } else if (type === 'deity') {
                    results.deities.push(baseInfo);
                } else if (type === 'patron') {
                    results.patrons.push(baseInfo);
                } else if (type === 'talent') {
                    results.talents.push(baseInfo);
                } else if (type === 'spell') {
                    this._processSpellDiscovery(client, item, uuid, baseInfo, results, discoveryTasks);
                }
            }
        }

        if (discoveryTasks.length > 0) {
            await Promise.all(discoveryTasks);
        }
    }

    private async _fetchClassDiscovery(client: any, uuid: string, baseInfo: any, results: any) {
        try {
            const doc = await Promise.race([
                client.fetchByUuid(uuid),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching ${uuid}`)), 5000))
            ]) as any;

            if (doc) {
                results.classes.push({
                    ...baseInfo,
                    system: {
                        description: doc.system?.description || "",
                        languages: doc.system?.languages || [],
                        talents: doc.system?.talents || [],
                        talentChoices: doc.system?.talentChoices || [],
                        talentChoiceCount: doc.system?.talentChoiceCount || 0,
                        spellcasting: doc.system?.spellcasting || null
                    }
                });
                if (doc.system?.titles) results.titles[doc.name] = doc.system.titles;
            }
        } catch (e) {
            logger.error(`ShadowdarkAdapter | Failed to fetch class ${uuid}:`, e);
        }
    }

    private async _fetchAncestryDiscovery(client: any, uuid: string, baseInfo: any, results: any) {
        try {
            const doc = await Promise.race([
                client.fetchByUuid(uuid),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching ${uuid}`)), 5000))
            ]) as any;

            if (doc) {
                results.ancestries.push({
                    ...baseInfo,
                    system: {
                        description: doc.system?.description || "",
                        languages: doc.system?.languages || [],
                        talents: doc.system?.talents || [],
                        talentChoices: doc.system?.talentChoices || [],
                        talentChoiceCount: doc.system?.talentChoiceCount || 0
                    }
                });
            }
        } catch (e) {
            logger.error(`ShadowdarkAdapter | Failed to fetch ancestry ${uuid}:`, e);
        }
    }

    private async _fetchLanguageDiscovery(client: any, uuid: string, baseInfo: any, results: any) {
        try {
            const doc = await Promise.race([
                client.fetchByUuid(uuid),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching ${uuid}`)), 5000))
            ]) as any;

            results.languages.push({
                ...baseInfo,
                rarity: (doc?.system?.rarity || 'common').toLowerCase()
            });
        } catch (e) {
            logger.error(`ShadowdarkAdapter | Failed to fetch language ${uuid}:`, e);
            results.languages.push({ ...baseInfo, rarity: 'common' });
        }
    }

    private _processSpellDiscovery(client: any, item: any, uuid: string, baseInfo: any, results: any, discoveryTasks: Promise<void>[]) {
        const tier = item.system?.tier ?? item['system.tier'] ?? null;
        const classes = item.system?.class ?? item['system.class'] ?? null;
        const duration = item.system?.duration ?? item['system.duration'] ?? null;
        const range = item.system?.range ?? item['system.range'] ?? null;

        if (tier !== null && classes !== null && duration !== null && range !== null) {
            results.spells.push({
                ...baseInfo,
                tier: Number(tier),
                class: Array.isArray(classes) ? classes : [classes].filter(Boolean),
                duration,
                range
            });
        } else {
            discoveryTasks.push((async () => {
                try {
                    const doc = await Promise.race([
                        client.fetchByUuid(uuid),
                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching ${uuid}`)), 5000))
                    ]) as any;

                    if (doc) {
                        results.spells.push({
                            ...baseInfo,
                            tier: doc.system?.tier || 0,
                            class: Array.isArray(doc.system?.class) ? doc.system.class : [doc.system?.class].filter(Boolean),
                            duration: doc.system?.duration,
                            range: doc.system?.range
                        });
                    }
                } catch (e) {
                    logger.error(`ShadowdarkAdapter | Failed to fetch spell ${uuid}:`, e);
                }
            })());
        }
    }

    private async _processWorldItems(client: any, results: any, processedUuids: Set<string>) {
        const worldItems = await client.dispatchDocumentSocket('Item', 'get', { broadcast: false });
        const items = worldItems?.result || [];

        for (const item of items) {
            const type = (typeof item.type === 'string' ? item.type : '').toLowerCase();
            const uuid = item.uuid || `Item.${item._id || item.id}`;

            if (processedUuids.has(uuid)) continue;
            processedUuids.add(uuid);

            const baseInfo = { name: item.name, uuid, img: item.img };

            if (type === 'spell') {
                results.spells.push({
                    ...baseInfo,
                    tier: item.system?.tier || 0,
                    class: Array.isArray(item.system?.class) ? item.system.class : [item.system?.class].filter(Boolean)
                });
            } else if (type === 'class') {
                results.classes.push(baseInfo);
                if (item.system?.titles) results.titles[item.name] = item.system.titles;
            } else if (type === 'talent') {
                results.talents.push(baseInfo);
            } else if (type === 'ancestry') {
                results.ancestries.push(baseInfo);
            } else if (type === 'background') {
                results.backgrounds.push(baseInfo);
            }
        }
    }

    private _resolveSpellClasses(results: any) {
        const classUuidLookup = new Map<string, string>();
        results.classes.forEach((c: any) => {
            if (c.uuid) classUuidLookup.set(c.uuid.toLowerCase(), c.name.toLowerCase());
        });

        results.spells = results.spells.map((s: any) => {
            const rawClasses = Array.isArray(s.class) ? s.class : [s.class].filter(Boolean);
            const resolved = rawClasses.map((c: any) => {
                const cStr = String(c);
                const cLower = cStr.toLowerCase();
                const found = classUuidLookup.get(cLower);
                if (found) return found;

                const knownClasses = ['wizard', 'priest', 'witch', 'warlock', 'ranger', 'bard', 'druid', 'seer'];
                for (const cls of knownClasses) {
                    if (cLower.includes(`.${cls}.`) || cLower.includes(`/${cls}/`) || cLower.includes(`item.${cls}`)) {
                        return cls;
                    }
                }
                return (cStr.includes('.') ? cStr : cLower);
            });
            return { ...s, class: resolved };
        });
    }

    // --- Active Effect Application ---

    private applyEffects(actor: any, systemData: any) {
        const effects = actor.effects || [];
        if (!effects.length) return;

        logger.debug(`[ShadowdarkAdapter] Processing ${effects.length} effects for ${actor.name}`);

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
            if (effect.disabled) {
                logger.debug(`[ShadowdarkAdapter] Skipping disabled effect: ${effect.name || effect.label}`);
                continue;
            }

            const changes = effect.changes || [];
            logger.debug(`[ShadowdarkAdapter] Effect "${effect.name || effect.label}" has ${changes.length} changes`);

            for (const change of changes) {
                const { key, value, mode } = change;
                if (!key) continue;

                logger.debug(`[ShadowdarkAdapter] Processing change: key="${key}", value="${value}", mode=${mode}`);

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
                    'hp.bonus': 'attributes.hp.bonus',
                    'bonuses.acBonus': 'attributes.ac.bonus',
                    'bonuses.attackBonus': 'attributes.attack.bonus',
                    'bonuses.meleeAttackBonus': 'attributes.attack.melee.bonus',
                    'bonuses.rangedAttackBonus': 'attributes.attack.ranged.bonus',
                    'bonuses.spellAttackBonus': 'attributes.attack.spell.bonus'
                };

                if (SHORTHANDS[path]) {
                    path = SHORTHANDS[path];
                }

                const currentVal = Number(getProperty(systemData, path)) || 0;
                const changeVal = Number(value) || 0;
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

                logger.debug(`[ShadowdarkAdapter] Applying Change: ${key} (mode=${mode}) ${currentVal} -> ${finalVal}`);
                setProperty(systemData, path, finalVal);
            }
        }
    }

    normalizeActorData(actor: any, client?: any): ActorSheetData {
        const actorName = actor.name || 'Unknown Actor';
        logger.debug(`[ShadowdarkAdapter] Normalizing Actor Data: ${actorName} (${actor.id || actor._id})`);

        // Clone system data to apply effects without mutating raw data
        const s = typeof structuredClone === 'function'
            ? structuredClone(actor.system)
            : JSON.parse(JSON.stringify(actor.system));

        // Sanitization & Derived Data (Avoid mutating original actor)
        let actorImg = actor.img;
        let actorItems = actor.items ? [...actor.items] : [];

        if (client) {
            actorImg = client.resolveUrl(actorImg);
            actorItems = actorItems.map((i: any) => ({
                ...i,
                img: client.resolveUrl(i.img)
            }));

            if (s.details?.biography?.value) {
                s.details.biography.value = client.resolveHtml(s.details.biography.value);
            }
            if (s.details?.notes?.value) {
                s.details.notes.value = client.resolveHtml(s.details.notes.value);
            }
            if (s.notes && typeof s.notes === 'string') {
                s.notes = client.resolveHtml(s.notes);
            }
        }

        // Apply Active Effects to the cloned system data
        this.applyEffects(actor, s);

        let classItem = actorItems.find((i: any) => (i.type || "").toLowerCase() === 'class');

        // If no Class item found, try to resolve from system.class (UUID or name)
        if (!classItem && actor.system?.class && typeof window === 'undefined') {
            const classRef = actor.system.class;
            if (typeof classRef === 'string') {
                // 1. Try UUID lookup
                let doc = dataManager.index.get(classRef) ||
                    dataManager.index.get(`Compendium.${classRef.replace('Compendium.', '')}`);

                // 2. Try Name lookup fallback
                if (!doc) {
                    const normalized = classRef.toLowerCase();
                    for (const d of dataManager.index.values()) {
                        if (d.type === 'Class' && d.name.toLowerCase() === normalized) {
                            doc = d;
                            break;
                        }
                    }
                }

                if (doc) {
                    classItem = doc;
                    logger.debug(`[ShadowdarkAdapter] Resolved missing Class item from Ref: ${classRef} -> ${doc.name}`);
                }
            }
        }
        if (classItem) {
            logger.debug(`[ShadowdarkAdapter] Found Class item: ${classItem.name}`);
        } else {
            logger.debug(`[ShadowdarkAdapter] No Class item found. actor.system.class: ${actor.system?.class}`);
        }

        let patronItem = actorItems.find((i: any) => (i.type || "").toLowerCase() === 'patron');

        // If Patron item exists but system.patron link has changed (Foundry hasn't swapped the item yet?)
        // prioritize the link for the name resolution
        if (actor.system?.patron && typeof window === 'undefined') {
            const patronRef = actor.system.patron;
            const patronLinkMatches = patronItem && (
                patronItem.name === patronRef ||
                patronItem.id === patronRef ||
                patronItem._id === patronRef ||
                patronItem.uuid === patronRef ||
                patronItem.flags?.core?.sourceId === patronRef
            );

            if (!patronLinkMatches) {
                let doc = dataManager.index.get(patronRef) ||
                    dataManager.index.get(`Compendium.${patronRef.replace('Compendium.', '')}`);

                if (!doc) {
                    const normalized = patronRef.toLowerCase();
                    for (const d of dataManager.index.values()) {
                        if (d.type === 'Patron' && d.name.toLowerCase() === normalized) {
                            doc = d;
                            break;
                        }
                    }
                }

                if (doc) {
                    // Update actorItems list so normalizedItems used by sheet will have the correct patron
                    const existingIdx = actorItems.findIndex((i: any) => (i.type || "").toLowerCase() === 'patron');
                    if (existingIdx > -1) {
                        actorItems[existingIdx] = doc;
                    } else {
                        actorItems.push(doc);
                    }
                    patronItem = doc;
                    logger.debug(`[ShadowdarkAdapter] Resolved Patron from Link (Override): ${patronRef} -> ${doc.name}`);
                }
            }
        }

        // Shadowdark Schema:
        // system.attributes.hp: { value, max, base, bonus }
        // system.attributes.ac: { value }
        // system.abilities: { str: { mod, ... }, ... }

        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = actor.computed?.ac ?? s.attributes?.ac?.value ?? 10;
        const maxHp = actor.computed?.maxHp ?? hp.max;

        // Helper to ensure modifiers are calculated
        const ensureMod = (stat: any) => {
            if (!stat) return { value: 10, mod: 0, base: 10, bonus: 0 };

            // Prioritize 'total' field if available, otherwise calculate from base + bonus
            // The 'value' field can be stale in Foundry, but 'total' and 'base' are reliable
            let val = Number(stat.total);
            if (isNaN(val)) {
                val = Number(stat.base || 10) + Number(stat.bonus || 0);
            }

            const mod = Math.floor((val - 10) / 2);
            // Return raw props but ensure value/mod are synced
            return { ...stat, value: val, mod };
        };

        const abilities: any = {};
        const computedAbilities = actor.computed?.abilities || {};

        if (s.abilities) {
            for (const key of Object.keys(s.abilities)) {
                // Try to find computed value with case-insensitive match
                const computed = computedAbilities[key] ||
                    computedAbilities[key.toLowerCase()] ||
                    computedAbilities[key.toUpperCase()];

                if (computed) {
                    // Prioritize Foundry-computed values (which are effect-aware)
                    abilities[key] = {
                        ...s.abilities[key],
                        value: computed.value ?? s.abilities[key].value,
                        mod: computed.mod ?? s.abilities[key].mod
                    };
                } else {
                    abilities[key] = ensureMod(s.abilities[key]);
                }


            }
        } else {
            // Fallback default
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
                const computed = computedAbilities[k] || computedAbilities[k.toUpperCase()];
                abilities[k] = computed ? { ...computed } : { value: 10, mod: 0, base: 10 };
            });
        }

        // Resolve helper for items
        const findItemName = (type: string, uuidField?: string) => {
            // 1. Try finding by Type (Case-Insensitive)
            const itemByType = actorItems.find((i: any) => i.type.toLowerCase() === type.toLowerCase());
            if (itemByType) return itemByType.name;

            // 2. If we have a UUID in the system field, look for an item with that UUID (or Source ID)
            if (uuidField && typeof uuidField === 'string' && uuidField.length > 0) {
                const itemByUuid = actorItems.find((i: any) => i.uuid === uuidField || i.flags?.core?.sourceId === uuidField || i.id === uuidField);
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
        const patronName = findItemName('Patron', s.patron || s.details?.patron) || resolved.patron || s.patron || s.details?.patron || '';

        // Unified Spellcaster Logic (v2: Broad Keyword Match + Collection Robustness)
        const isCaster = isSpellcaster({ ...actor, items: actorItems, system: s });
        const showSpellsTab = shouldShowSpellsTab({ ...actor, items: actorItems, system: s });

        // Map items for the view
        const levelVal = s.level?.value || 0;
        const xpVal = s.level?.xp || 0;
        const nextXP = Number(s.level?.xp_max) || (Math.max(1, levelVal) * 10);
        const levelUp = xpVal >= nextXP && nextXP > 0;

        const computed = {
            ...(actor.computed || {}),
            isSpellCaster: isCaster,
            canUseMagicItems: canUseMagicItems({ ...actor, items: actorItems, system: s }),
            showSpellsTab: showSpellsTab,
            classDetails: classItem,
            patronDetails: patronItem,
            xpNextLevel: nextXP,
            levelUp: levelUp,
            // Ensure gearSlots is always set, using browser-computed value if available,
            // otherwise calculate it using the effect-modified system data
            gearSlots: actor.computed?.gearSlots ?? calculateMaxSlots({ ...actor, items: actorItems, system: s })
        };

        // --- ROBUST EFFECT MERGING ---
        const effects: any[] = [];
        const allFoundryEffects: any[] = [];

        // 1. Collect Actor Effects
        const actorEffects = actor.effects?.contents || Array.from(actor.effects || []);
        for (const e of actorEffects) allFoundryEffects.push(e);

        // 2. Crawl Items for any effects NOT already captured
        const itemsToCrawl = actorItems;
        for (const item of itemsToCrawl) {
            const itemEffects = item.effects?.contents || Array.from(item.effects || []);
            for (const e of itemEffects) {
                const eId = e.id || e._id;
                const isDuplicate = allFoundryEffects.some(ae => {
                    const aeId = ae.id || ae._id;
                    if (aeId === eId) return true;
                    if (ae.name === (e.name || e.label) && ae.origin && ae.origin.includes(item.id || item._id)) return true;
                    return false;
                });

                if (!isDuplicate) {
                    if (item.name) (e as any)._parentName = item.name;
                    allFoundryEffects.push(e);
                }
            }
        }

        // 3. Process and Resolve Sources
        for (const e of allFoundryEffects) {
            const eId = e.id || e._id;
            let sourceName = e.sourceName || (e as any)._parentName || "Unknown";

            // Try to resolve from origin UUID if Unknown
            if (sourceName === "Unknown" && e.origin) {
                // Manually parse origin if possible (since we can't async await easily here)
                const parts = e.origin.split('.');
                const actorIdx = parts.indexOf('Actor');
                const itemIdx = parts.indexOf('Item');

                if (actorIdx !== -1 && parts[actorIdx + 1]) {
                    const originActorId = parts[actorIdx + 1];
                    const isSameActor = originActorId === (actor.id || actor._id);

                    if (itemIdx !== -1 && parts[itemIdx + 1]) {
                        const itemId = parts[itemIdx + 1];
                        if (isSameActor) {
                            // @ts-ignore
                            const sourceItem = itemsToCrawl.find(it => (it.id || it._id) === itemId);
                            if (sourceItem) {
                                sourceName = sourceItem.name;
                            } else {
                                sourceName = e.origin;
                            }
                        } else {
                            sourceName = actor.name; // User verification: Different actor ID resolved to "Zaldini the Red"
                        }
                    } else {
                        sourceName = actor.name;
                    }
                } else {
                    sourceName = e.origin;
                }
            }

            // Final fallback check
            if (sourceName === "Unknown" || sourceName === "undefined" || sourceName === "null") {
                sourceName = e.flags?.shadowdark?.sourceName || e.source || e.origin || "Unknown";
            }

            if (sourceName === "Unknown" && e.label && e.label.includes(':')) {
                sourceName = e.label.split(':')[0].trim();
            }

            if (sourceName === "undefined" || sourceName === "null") sourceName = "Unknown";

            // Deduplicate by ID
            if (effects.some(ef => ef._id === eId)) continue;

            effects.push({
                _id: eId,
                name: e.name || e.label,
                img: client ? client.resolveUrl(e.img || e.icon) : (e.img || e.icon),
                disabled: !!e.disabled,
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
                sourceName: sourceName,
                transfer: e.transfer,
                statuses: Array.from(e.statuses ?? [])
            });
        }

        // Pre-normalize items so derived calculations use correct data
        const normalizedItems = actorItems.map((i: any) => {
            const item = { ...i, id: i.id || i._id };
            try {
                applyItemDataOverrides(item);
                item.spells = getItemSpells(item);
            } catch (e: any) {
                logger.error(`Error processing item overrides for ${item.name}`, e);
            }
            return item;
        });

        const sheetData: ActorSheetData = {
            id: actor.id || actor._id,
            name: actor.name,
            type: actor.type,
            img: actorImg,
            system: s, // Include raw system data for bindings
            hp: { value: hp.value, max: maxHp },
            ac: ac,
            attributes: abilities,
            stats: abilities,
            items: normalizedItems,
            level: {
                value: s.level?.value || 1,
                xp: s.level?.xp || 0,
                next: Number(s.level?.xp_max) || (Math.max(1, s.level?.value || 1) * 10)
            },
            details: {
                alignment: (s.alignment || s.details?.alignment) ? ((s.alignment || s.details?.alignment).charAt(0).toUpperCase() + (s.alignment || s.details?.alignment).slice(1)) : 'Neutral',
                background: backgroundName,
                ancestry: ancestryName,
                class: className,
                patron: patronName,
                deity: s.deity,
                languages: s.languages || [],
                classLanguages: classItem?.system?.languages || [],
                biography: s.details?.biography?.value || s.biography || '',
                notes: s.notes || s.details?.notes?.value || ''
            },
            luck: s.luck,
            coins: s.coins,
            effects: effects, // Use robustly merged effects
            computed: computed,
            choices: {
                alignments: actor.systemConfig?.ALIGNMENTS ? Object.values(actor.systemConfig.ALIGNMENTS) : ['Lawful', 'Neutral', 'Chaotic'],
                ancestries: [], // Placeholder, populate if cached or passed
                backgrounds: [] // Placeholder
            },
            derived: {
                ...this.calculateAttacks(actor, abilities),
                ...this.categorizeInventory({ ...actor, computed })
            }
        };

        logger.debug(`[ShadowdarkAdapter] Normalized Data for ${actor.name}: isSpellCaster=${computed.isSpellCaster}, showSpellsTab=${computed.showSpellsTab}, levelUp=${computed.levelUp} (${xpVal}/${nextXP})`);

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
                    // PREFER: Compendium Source ID if available, then Item UUID
                    const linkUuid = item.flags?.core?.sourceId || item.uuid;
                    updates[`system.${field}`] = linkUuid;
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

            if (system.stashed && type !== 'Gem') {
                stashed.push({ ...item, derived: { ...item.derived, slots } });
            } else if (system.equipped && type !== 'Gem') {
                equipped.push({ ...item, derived: { ...item.derived, slots } });
                // if (!system.stashed) totalSlots += slots; // Redundant now as stashed is handled above
                totalSlots += slots;
            } else {
                // Carried (Not Equipped, Not Stashed) or a Gem (which we handle specially)
                const excludedTypes = ['Class', 'Ancestry', 'Background', 'Language', 'Talent', 'Spell', 'Effect', 'Deity', 'Title', 'Feature', 'Boon', 'Gem'];
                const isExcluded = excludedTypes.some(t => t.toLowerCase() === type.toLowerCase());

                if (!isExcluded) {
                    carried.push({ ...item, derived: { ...item.derived, slots } });
                }

                // Treasure (non-gem) still counts towards slots per item if not stashed
                // Logic: It is carried (not equipped, not stashed), so it counts.
                if ((type === 'Treasure' || !isExcluded) && type !== 'Gem') {
                    totalSlots += slots;
                }
            }
        });

        // Add special slot calculations for Gems and Coins
        const gems = items.filter((i: any) => i.type === 'Gem');
        totalSlots += calculateGemSlots(gems);
        totalSlots += calculateCoinSlots(actor.system?.coins);

        const maxSlots = actor.computed?.gearSlots ?? calculateMaxSlots(actor);

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

    validateUpdate(path: string, _value: any): boolean {
        // Log for debugging (intentional audit trail)
        logger.debug(`[ShadowdarkAdapter] Validating update path: ${path}`);

        // 1. Whitelist for granular system paths
        const whitelistPaths = [
            // Stats (Base & Value only)
            /^system\.abilities\.(str|dex|con|int|wis|cha)\.(value|base)$/,

            // Attributes
            /^system\.attributes\.hp\.(value|max|base|bonus)$/,
            /^system\.attributes\.ac\.value$/,

            // Progression & Luck
            /^system\.level\.(value|xp)$/,
            /^system\.luck\.available$/,

            // Details
            /^system\.languages$/,
            /^system\.alignment$/,
            /^system\.deity$/,
            /^system\.details\.biography\.value$/,
            /^system\.details\.notes\.value$/,
            /^system\.class$/,
            /^system\.ancestry$/,
            /^system\.background$/,
            /^system\.patron$/,
            /^system\.title$/,

            // Currency
            /^system\.coins\.(gp|sp|cp)$/,
            /^system\.currency\.(gp|sp|cp)$/
        ];

        // 2. Item-level updates
        // Format: items.ID.system.prop
        if (path.startsWith('items.')) {
            const parts = path.split('.');
            if (parts.length >= 3) {
                // Reject derived or computed property updates on items
                return !path.includes('derived') && !path.includes('computed');
            }
            return false;
        }

        // 3. Effects (Enabled/Disabled/Delete)
        if (path.startsWith('effects.')) return true;

        // 4. Match whitelist regexes
        return whitelistPaths.some(regex => regex.test(path));
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

            // Global Bonuses (from talents/effects)
            const globalAttackBonus = Number(actor.system?.bonuses?.attackBonus || 0);
            const globalDamageBonus = Number(actor.system?.bonuses?.damageBonus || 0);
            const meleeAttackBonus = Number(actor.system?.bonuses?.meleeAttackBonus || 0);
            const meleeDamageBonus = Number(actor.system?.bonuses?.meleeDamageBonus || 0);
            const rangedAttackBonus = Number(actor.system?.bonuses?.rangedAttackBonus || 0);
            const rangedDamageBonus = Number(actor.system?.bonuses?.rangedDamageBonus || 0);

            // Item Bonus
            const itemBonus = Number(item.system?.bonuses?.attackBonus || 0);

            // Damage String
            let damage = item.system?.damage?.value || `${item.system?.damage?.numDice || 1}${item.system?.damage?.oneHanded || 'd4'}`;

            // Melee Logic
            if (item.system?.type === 'melee') {
                const totalMeleeBonus = (isFinesse ? Math.max(strMod, dexMod) : strMod) + itemBonus + globalAttackBonus + meleeAttackBonus;

                // Add damage bonus to string if > 0
                const totalDamageBonus = globalDamageBonus + meleeDamageBonus;
                if (totalDamageBonus > 0) {
                    damage += `+${totalDamageBonus}`;
                } else if (totalDamageBonus < 0) {
                    damage += `${totalDamageBonus}`;
                }

                melee.push({
                    ...item,
                    derived: {
                        toHit: totalMeleeBonus >= 0 ? `+${totalMeleeBonus}` : `${totalMeleeBonus}`,
                        damage: damage,
                        isFinesse
                    }
                });
            }

            // Ranged Logic (includes Thrown melees)
            if (isRangedType || hasRange || (item.system?.type === 'melee' && isThrown)) {
                const totalRangedBonus = dexMod + itemBonus + globalAttackBonus + rangedAttackBonus;

                // Add damage bonus to string if > 0
                const totalDamageBonus = globalDamageBonus + rangedDamageBonus;
                let rangedDamage = damage;
                if (totalDamageBonus > 0) {
                    rangedDamage += `+${totalDamageBonus}`;
                } else if (totalDamageBonus < 0) {
                    rangedDamage += `${totalDamageBonus}`;
                }

                ranged.push({
                    ...item,
                    derived: {
                        toHit: totalRangedBonus >= 0 ? `+${totalRangedBonus}` : `${totalRangedBonus}`,
                        damage: rangedDamage,
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
        if (advMode === 'advantage') dice = '2d20kh';
        if (advMode === 'disadvantage') dice = '2d20kl';

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
                formula: `${dice}${sign}${mod}`,
                type: 'ability',
                label: `${key.toUpperCase().replace('ABILITY', '')} Check`
            };
        }

        if (type === 'item') {
            let item = (actor.items || []).find((i: any) => i._id === key || i.id === key);

            // Fallback: Use provided itemData from options (e.g. for unowned spells)
            if (!item && options.itemData) {
                item = options.itemData;
            }

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
                        const statKey = item.system?.ability || actor.computed?.spellcastingAbility?.toLowerCase() || 'int';
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
                        const itemBonus = Number(item.system?.bonuses?.attackBonus || 0);

                        // Global Bonuses
                        const globalAttackBonus = Number(actor.system?.bonuses?.attackBonus || 0);
                        const meleeAttackBonus = Number(actor.system?.bonuses?.meleeAttackBonus || 0);
                        const rangedAttackBonus = Number(actor.system?.bonuses?.rangedAttackBonus || 0);

                        let mod = 0;
                        if (isRanged) {
                            mod = dex + globalAttackBonus + rangedAttackBonus;
                        } else if (isFinesse) {
                            mod = Math.max(str, dex) + globalAttackBonus + meleeAttackBonus;
                        } else {
                            mod = str + globalAttackBonus + meleeAttackBonus;
                        }
                        totalBonus = mod + itemBonus;
                    }
                }

                // Add Talent Bonus
                if (options.talentBonus) totalBonus += Number(options.talentBonus);

                const sign = totalBonus >= 0 ? '+' : '';
                return {
                    formula: `${dice}${sign}${totalBonus}`,
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
            let name = cache.getName(uuid);

            if (!name) {
                // Attempt Normalization for mismatched casing (e.g. Shadowdark -> shadowdark, Classes -> classes)
                const parts = uuid.split('.');
                logger.debug(`[ShadowdarkAdapter] Resolving: ${uuid}`);

                if (parts.length >= 5 && parts[0] === 'Compendium') {
                    // parts[1] = System, parts[2] = Pack
                    // We want to force System matches to be lower (shadowdark)
                    // We want to force Pack matches to be lower (classes, ancestries)
                    // But we MUST preserve the ID (parts[4])!

                    const system = parts[1].toLowerCase();
                    const pack = parts[2].toLowerCase();
                    const type = parts[3]; // Keep as is, usually Item
                    const id = parts[4];   // Keep case crucial!

                    const normalized = `Compendium.${system}.${pack}.${type}.${id}`;
                    name = cache.getName(normalized);

                    if (!name) logger.debug(`[ShadowdarkAdapter] Failed normalized: ${normalized}`);
                    else logger.debug(`[ShadowdarkAdapter] Success normalized: ${normalized} -> ${name}`);
                }
            }
            return name;
        };

        if (actor.system) {
            actor.computed.resolvedNames.class = resolve(actor.system.class, actor.computed.resolvedNames.class);
            actor.computed.resolvedNames.ancestry = resolve(actor.system.ancestry, actor.computed.resolvedNames.ancestry);
            actor.computed.resolvedNames.background = resolve(actor.system.background, actor.computed.resolvedNames.background);
        }
    }

    async resolveDocument(client: any, uuid: string): Promise<any | null> {
        if (typeof window === 'undefined' && uuid.startsWith('Compendium.shadowdark.')) {
            try {
                const { dataManager } = await import('./data/DataManager');
                const doc = await dataManager.getDocument(uuid);
                return doc;
            } catch (e) {
                logger.warn(`ShadowdarkAdapter | resolveDocument failed for ${uuid}: ${e}`);
            }
        }
        return null;
    }

    async loadSupplementaryData(cache: any): Promise<void> {
        try {
            let index: Record<string, string> = {};

            if (typeof window === 'undefined') {
                // Server-side: Direct load
                try {
                    const { dataManager } = await import('./data/DataManager');
                    index = await dataManager.getIndex();
                    logger.debug(`[ShadowdarkAdapter] Loaded ${Object.keys(index).length} local entries via DataManager (Server-side).`);
                } catch (err) {
                    logger.error('[ShadowdarkAdapter] Failed to import DataManager', err);
                    return;
                }
            } else {
                // Client-side: Fetch from API
                const res = await fetch('/api/modules/shadowdark/index');
                if (!res.ok) return;
                index = await res.json();
            }

            let count = 0;
            for (const [uuid, name] of Object.entries(index)) {
                // @ts-ignore
                cache.set(uuid, name as string);
                count++;
            }
            if (typeof window !== 'undefined') {
                logger.debug(`[ShadowdarkAdapter] Loaded ${count} local index entries (Client-side).`);
            }
        } catch (e) {
            logger.error('[ShadowdarkAdapter] Failed to load local data', e);
        }
    }

    /**
     * Fetch and normalize Level Up data
     */
    async getLevelUpData(client: any, actor: any, classUuidOverride?: string, patronUuidOverride?: string) {
        const currentLevel = actor?.system?.level?.value || 0;
        const targetLevel = currentLevel + 1;
        const currentXP = actor?.system?.level?.xp || 0;

        // Prefer override if provided
        const classUuid = classUuidOverride || actor?.system?.class;
        const patronUuid = patronUuidOverride || actor?.system?.patron;
        const conMod = actor?.system?.abilities?.con?.mod || 0;

        let classDoc = null;
        let patronDoc = null;

        // 1. Try Local DataManager first (Fastest)
        if (classUuid) classDoc = await dataManager.getDocument(classUuid);
        if (patronUuid) patronDoc = await dataManager.getDocument(patronUuid);

        // 2. Fallback to Foundry Fetch (Slower but guaranteed if UUID valid)
        if (!classDoc && classUuid) {
            logger.debug(`[ShadowdarkAdapter] Class not in cache, fetching from Foundry: ${classUuid}`);
            try {
                classDoc = await client.fetchByUuid(classUuid);
            } catch (e) { logger.error(`[ShadowdarkAdapter] Failed to fetch class ${classUuid}:`, e); }
        }

        if (!patronDoc && patronUuid) {
            try {
                patronDoc = await client.fetchByUuid(patronUuid);
            } catch (e) { logger.error(`[ShadowdarkAdapter] Failed to fetch patron ${patronUuid}:`, e); }
        }

        // Logic Calculation
        const talentGained = targetLevel % 2 !== 0;

        // Centralized Spellcaster Check
        const isSpellcasterChar = classDoc ? isClassSpellcaster(classDoc) : false;

        const spellsToChoose: Record<number, number> = {};
        let availableSpells: any[] = [];

        if (isSpellcasterChar && classDoc) {
            // Spells Known Calculation
            if (classDoc.system?.spellcasting?.spellsknown) {
                const skTable = classDoc.system.spellcasting.spellsknown;
                // Shadowdark keys are sometimes strings "1", "2"
                const currentSpells = skTable[String(currentLevel)] || skTable[currentLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                const targetSpells = skTable[String(targetLevel)] || skTable[targetLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                for (let tier = 1; tier <= 5; tier++) {
                    const tStr = String(tier);
                    const targetVal = targetSpells[tStr] ?? targetSpells[tier] ?? 0;
                    const currentVal = currentSpells[tStr] ?? currentSpells[tier] ?? 0;
                    const diff = targetVal - currentVal;
                    if (diff > 0) {
                        spellsToChoose[tier] = diff;
                    }
                }
            }

            // Available Spells
            if (classDoc.name) {
                availableSpells = await dataManager.getSpellsBySource(classDoc.name);
            }
        }

        // Return standardized object
        return {
            success: true,
            actorId: actor?.id || actor?._id || 'new',
            currentLevel,
            targetLevel,
            currentXP,
            talentGained,
            classHitDie: classDoc?.system?.hitPoints || '1d4',
            classTalentTable: classDoc?.system?.classTalentTable,
            patronBoonTable: patronDoc?.system?.boonTable,
            canRollBoons: classDoc?.system?.patron?.required || false,
            startingBoons: (targetLevel === 1 && classDoc?.system?.patron?.startingBoons) || 0,
            isSpellcaster: isSpellcasterChar,
            spellsToChoose,
            availableSpells,
            conMod,
            classUuid: classDoc?.uuid || classUuid || null
        };
    }

    async expandTableResults(client: any, table: any): Promise<any[] | null> {
        if (!table || !table._id) return null;

        try {
            // Shadowdark export quirk: Server sends stale result IDs, but disk has valid result files
            // in the format: !tables.results!{tableId}.{resultId}.json
            // We use DataManager to find these files.

            // FIRST: Check if DataManager already has the hydrated version
            const uuid = table.uuid || `Compendium.shadowdark.rollable-tables.RollTable.${table._id}`;
            const hydrated = await dataManager.getDocument(uuid);

            if (hydrated && hydrated.results && Array.isArray(hydrated.results) && typeof hydrated.results[0] === 'object') {
                logger.debug(`[ShadowdarkAdapter] Using hydrated results for table ${table._id}`);
                return hydrated.results;
            }

            // FALLBACK: Scan all documents (existing logic)
            const allDocs = await dataManager.getAllDocuments();
            const tableId = table._id;

            // Filter all cached documents for ones belonging to this table
            const results = allDocs.filter((doc: any) => {
                // Check for the unique key format used by DataManager for embedded results
                return doc._key && doc._key.includes(`!tables.results!${tableId}.`);
            });

            if (results && results.length > 0) {
                logger.debug(`[ShadowdarkAdapter] Found ${results.length} cached results for table ${tableId} via scan`);
                return results;
            }
        } catch (e) {
            logger.error(`[ShadowdarkAdapter] Error expanding table results: ${e}`);
        }

        return null;
    }
}
