import { logger } from '@shared/utils/logger';
import { persistentCache } from '@core/cache/PersistentCache';
import { CompendiumCache } from '@core/foundry/compendium-cache';
import { isRareLanguage } from '../logic/rules';
import { SYSTEM_PREDEFINED_EFFECTS, BOON_TYPE_MAP, EFFECT_TRANSLATIONS_MAP } from '../data/talent-effects';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * ShadowdarkRegistry is a server-only service that manages system-wide data.
 * It consolidates the aggregation logic (previously in caching.ts) and 
 * the hydration engine (previously in DataManager.ts).
 */
export class ShadowdarkRegistry {
    private static instance: ShadowdarkRegistry;
    private get _state() {
        const globalAny = globalThis as any;
        if (!globalAny.__shadowdarkState) {
            globalAny.__shadowdarkState = {
                systemData: null,
                collections: {},
                nameIndex: {},
                lastFetch: 0
            };
        }
        return globalAny.__shadowdarkState;
    }

    private get systemData() { return this._state.systemData; }
    private set systemData(val: any) { this._state.systemData = val; }

    private get _collections() { return this._state.collections; }
    private set _collections(val: any) { this._state.collections = val; }

    private get nameIndex() { return this._state.nameIndex; }
    private set nameIndex(val: any) { this._state.nameIndex = val; }

    private get lastFetch() { return this._state.lastFetch; }
    private set lastFetch(val: any) { this._state.lastFetch = val; }

    private aggregationPromise: Promise<any> | null = null;
    private pendingFetches = new Map<string, Promise<any>>();
    
    private readonly SYSTEM_ID = 'shadowdark';
    private readonly CACHE_TTL = 300000; // 5 minutes

    private static readonly TYPE_TO_COLLECTION: Record<string, string> = {
        'ancestry': 'ancestries',
        'class': 'classes',
        'background': 'backgrounds',
        'deity': 'deities',
        'patron': 'patrons',
        'language': 'languages',
        'spell': 'spells',
        'talent': 'talents',
        'rolltable': 'tables',
        'item': 'gear',
        'weapon': 'gear',
        'armor': 'gear'
    };

    private static readonly COLLECTIONS = [
        ...new Set(Object.values(ShadowdarkRegistry.TYPE_TO_COLLECTION)),
        'magic-items', 'conditions', 'spell-effects', 'properties'
    ];

    private constructor() { }

    public static getInstance(): ShadowdarkRegistry {
        const globalAny = globalThis as any;
        if (!ShadowdarkRegistry.instance) {
            if (!globalAny.__shadowdarkRegistry) {
                globalAny.__shadowdarkRegistry = new ShadowdarkRegistry();
            }
            ShadowdarkRegistry.instance = globalAny.__shadowdarkRegistry;
        }
        return ShadowdarkRegistry.instance;
    }

    /**
     * Gets the full aggregated system data, reloading if stale.
     */
    public async getSystemData(_client?: any): Promise<any> {
        if (!this.isFresh()) {
            await this.aggregate();
        }

        // Return only the Lean Index and Metadata
        return {
            titles: this.systemData.titles || {},
            nameIndex: this.nameIndex || {},
            PREDEFINED_EFFECTS: { ...SYSTEM_PREDEFINED_EFFECTS },
            BOON_TYPES: { ...BOON_TYPE_MAP },
            EFFECT_TRANSLATIONS: { ...EFFECT_TRANSLATIONS_MAP },
            _debug: {
                source: this.isFresh() ? 'cache' : 'rehydrated',
                timestamp: Date.now(),
                pid: process.pid
            }
        };
    }

    public async getCollection(id: string, options: { summary?: boolean } = {}): Promise<any[]> {
        if (!this.isFresh()) await this.aggregate();
        const collection = (this._collections as any)[id] || [];

        // Force full data for character builder critical categories
        // This ensures the Generator gets "unaltered" data without diet summaries.
        const forceFull = [
            'ancestries', 'backgrounds', 'classes', 
            'deities', 'patrons', 'talents', 'languages'
        ].includes(id);

        if (options.summary && !forceFull) {
            return JSON.parse(JSON.stringify(collection.map((d: any) => ({
                uuid: d.uuid,
                name: d.name,
                img: d.img,
                rarity: d.rarity,
                type: d.type,
                tier: d.system?.tier,
                // Rule Shard Statistics
                system: {
                    cost: d.system?.cost,
                    slots: d.system?.slots,
                    properties: d.system?.properties,
                    description: d.system?.description,
                    tier: d.system?.tier,
                    talentClass: d.system?.talentClass,
                    talentLevel: d.system?.talentLevel,
                    requirement: d.system?.requirement,
                    class: d.system?.class
                }
            }))));
        }

        return JSON.parse(JSON.stringify(collection));
    }

    private async aggregate() {
        if (this.aggregationPromise) {
            return this.aggregationPromise;
        }

        this.aggregationPromise = (async () => {
            try {
                logger.info('[ShadowdarkRegistry] Starting manifest-driven aggregation...');
                
                const manifestKey = `manifest-${this.SYSTEM_ID}`;
                const manifest = await persistentCache.get<any>(this.SYSTEM_ID, manifestKey);
                
                if (!manifest || !manifest.packs) {
                    logger.warn(`[ShadowdarkRegistry] No manifest found for ${this.SYSTEM_ID}. Skipping aggregation.`);
                    this.systemData = {
                        ...this.createSkeleton(),
                        ...this._getRuleData()
                    };
                    return this.systemData;
                }

                const aggregated = this.createSkeleton();
                const encounteredUuids = new Set<string>();
                const compendiumCache = CompendiumCache.getInstance();
                
                // Load the "Truth" from info.json
                const infoPath = path.join(process.cwd(), 'src/modules/shadowdark/info.json');
                let allowedPacks: string[] = [];
                try {
                    const infoJson = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                    allowedPacks = (infoJson.discovery?.packs || []).map((p: any) => p.id);
                } catch (e) {
                    logger.error('[ShadowdarkRegistry] Failed to load info.json for filtering:', e);
                }

                const packIds = Object.keys(manifest.packs).filter(id => 
                    allowedPacks.length === 0 || allowedPacks.includes(id)
                );
                
                let loadedCount = 0;
                for (const packId of packIds) {
                    const shardKey = `pack-${packId.replace(/\./g, '-')}`;
                    const documents = await persistentCache.get<any[]>(this.SYSTEM_ID, shardKey);

                    if (documents && Array.isArray(documents)) {
                        loadedCount++;
                        this._processShardDocuments(packId, documents, aggregated, compendiumCache, encounteredUuids);
                    }
                }

                this._collections = aggregated;
                this.nameIndex = encounteredUuids.size > 0 ? Array.from(encounteredUuids).reduce((acc: Record<string, string>, uuid: string) => {
                    const name = compendiumCache.getName(uuid);
                    if (name) acc[uuid] = name as string;
                    return acc;
                }, {}) : {};
                
                // systemData now only contains the lean metadata/character-relevant objects
                this.systemData = {
                    ...this.createSkeleton(),
                    nameIndex: this.nameIndex,
                    titles: aggregated.titles || {},
                    ...this._getRuleData()
                };
                
                this.lastFetch = Date.now();
                
                const responseData = { ...this.systemData, _debug: { size: Object.keys(this.nameIndex).length, timestamp: this.lastFetch } };
                logger.info(`[ShadowdarkRegistry] Aggregation complete. ${loadedCount} shards processed. Index size: ${Object.keys(this.nameIndex).length}`);
                
                return responseData;
            } catch (err) {
                logger.error('[ShadowdarkRegistry] Aggregation failed:', err);
                throw err;
            } finally {
                this.aggregationPromise = null;
            }
        })();

        return this.aggregationPromise;
    }

    /**
     * Resolves a document by its UUID, hydrating it from Foundry if it's shallow.
     */
    public async getDocument(uuid: string, client?: any): Promise<any | null> {
        if (!uuid) return null;

        // 1. Check local aggregated cache
        if (!this.isFresh()) await this.aggregate();
        const collections = this._collections;

        // Diagnostic: Log if the request seems to be a valid UUID but not found
        let found = null;
        // Extract ID from UUID if possible for ID-based matching
        const extractedId = uuid.includes('.') ? uuid.split('.').pop() : uuid;

        for (const key of ShadowdarkRegistry.COLLECTIONS) {
            found = collections[key]?.find((d: any) => {
                const idMatch = d._id === extractedId || d.id === extractedId || d._id === uuid || d.id === uuid;
                if (d.uuid === uuid || idMatch) return true;
                
                // Flexible UUID matching (handle missing .Item. or .RollTable. segment)
                if (uuid.startsWith('Compendium.') && d.uuid?.startsWith('Compendium.')) {
                    const parts1 = uuid.split('.');
                    const parts2 = d.uuid.split('.');
                    // Basic sanity check: same pack
                    if (parts1[1] === parts2[1] && (parts1[2] === parts2[2] || parts1.length === parts2.length)) {
                        const id1 = parts1[parts1.length - 1];
                        const id2 = parts2[parts2.length - 1];
                        return id1 === id2;
                    }
                }
                return false;
            });
            // If it's a deep match (has system or is a table), return it
            if (found && (found.system || found.type === 'RollTable' || found.results)) {
                return JSON.parse(JSON.stringify(found));
            }
        }

        if (!found) {
            logger.debug(`[ShadowdarkRegistry] ${uuid} not found in cache. Registry has ${Object.keys(this.nameIndex).length} items.`);
        }

        // 2. Fetch from Foundry (Fulfillment)
        if (client) {
            if (this.pendingFetches.has(uuid)) return this.pendingFetches.get(uuid);

            const fetchPromise = (async () => {
                try {
                    logger.debug(`[ShadowdarkRegistry] Hydrating ${uuid} from Foundry...`);
                    const fullDoc = await client.fetchByUuid(uuid);
                    if (fullDoc) {
                        return this.inventoryDocument(uuid, fullDoc);
                    }
                    return null;
                } catch (e) {
                    logger.warn(`[ShadowdarkRegistry] Hydration failed for ${uuid}:`, e);
                    return null;
                } finally {
                    this.pendingFetches.delete(uuid);
                }
            })();

            this.pendingFetches.set(uuid, fetchPromise);
            return fetchPromise;
        }

        return null;
    }

    /**
     * Rolls on a table and ensures results are hydrated.
     */
    public async draw(uuidOrName: string, client: any, rollOverride?: number): Promise<any | null> {
        // Resolve from Cache ONLY
        let table = await this.getDocument(uuidOrName);
        
        if (!table && !uuidOrName.includes('.')) {
            table = await this.findByName(uuidOrName, 'RollTable');
        }

        if (!table || (!table.results && !table.results?.length)) {
            logger.warn(`[ShadowdarkRegistry] Draw failed: Table '${uuidOrName}' not found or empty (extractedId: ${uuidOrName.includes('.') ? uuidOrName.split('.').pop() : 'none'}).`);
            return null;
        }

        // Formula can be in system.formula or top-level formula
        const formula = table.system?.formula || table.formula || "1d20";
        let roll = rollOverride;
        
        if (roll === undefined) {
            // Simple simulator
            const match = formula.match(/^(\d+)d(\d+)$/i);
            if (match) {
                const count = parseInt(match[1]);
                const die = parseInt(match[2]);
                roll = 0;
                for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * die) + 1;
            } else {
                roll = Math.floor(Math.random() * 20) + 1;
            }
        }

        const matched = table.results.filter((r: any) => {
            const range = r.range || [1, 1];
            return roll! >= range[0] && roll! <= range[1];
        });

        const items: any[] = [];
        for (const res of matched) {
            // Shadowdark Table results use 'documentUuid' for direct compendium links
            const targetUuid = res.documentUuid || (res.documentCollection && res.documentId ? `Compendium.${res.documentCollection}.Item.${res.documentId}` : null);
            
            if (targetUuid) {
                const item = await this.getDocument(targetUuid, client);
                if (item) items.push(item);
            }
        }

        return {
            id: table._id || table.id,
            roll,
            total: roll,
            formula,
            results: matched,
            items: items,
            table
        };
    }

    /**
     * Finds a document in the index by name and type.
     */
    public async findByName(name: string, type?: string): Promise<any | null> {
        if (!this.isFresh()) await this.getSystemData();
        const normalized = name.toLowerCase();

        for (const key of ShadowdarkRegistry.COLLECTIONS) {
            const found = this._collections[key]?.find((doc: any) => {
                const matchesName = (doc.name || "").toLowerCase() === normalized;
                if (!matchesName) return false;
                if (!type) return true;

                const docType = (doc.type || "").toLowerCase();
                const targetType = type.toLowerCase();
                
                // Flexible matching for RollTables: match if category is tables and doc has results, 
                // even if explicit 'type' string is missing or different.
                if (targetType === 'rolltable' && (doc.results || key === 'tables')) return true;

                return docType === targetType;
            });
            if (found) return JSON.parse(JSON.stringify(found));
        }
        return null;
    }

    /**
     * Filters discovered spells by class source.
     */
    public async getSpellsBySource(className: string): Promise<any[]> {
        if (!this.isFresh()) await this.getSystemData();
        if (!this._collections?.spells) return [];

        const normalizedClass = className.toLowerCase();
        return JSON.parse(JSON.stringify(this._collections.spells.filter((spell: any) => {
            const spellClasses = spell.system?.class || [];
            const list = Array.isArray(spellClasses) ? spellClasses : [spellClasses];
            return list.some((c: string) => {
                const identifier = String(c).toLowerCase();
                
                // 1. Direct Name Match (e.g. "Priest")
                if (identifier.includes(normalizedClass)) return true;

                // 2. UUID Resolution (e.g. "Compendium.shadowdark.classes.Item.xxxx")
                const resolvedName = (this.nameIndex[c] || "").toLowerCase();
                if (resolvedName && resolvedName.includes(normalizedClass)) return true;

                return false;
            });
        })));
    }

    public async getIndex(): Promise<Record<string, string>> {
        if (!this.isFresh()) await this.getSystemData();
        return this.nameIndex;
    }

    /**
     * Updates/Inserts a hydrated document into the aggregated collection.
     */
    private inventoryDocument(uuid: string, doc: any): any {
        const enriched = { ...doc, uuid, isShallow: false };
        let updated = false;

        for (const key of ShadowdarkRegistry.COLLECTIONS) {
            if (!this._collections[key]) continue;
            const idx = this._collections[key].findIndex((d: any) => d.uuid === uuid || d._id === uuid || d.id === uuid);
            if (idx !== -1) {
                this._collections[key][idx] = enriched;
                updated = true;
            }
        }

        if (!updated) {
            const target = ShadowdarkRegistry.TYPE_TO_COLLECTION[doc.type?.toLowerCase()] || 'gear';
            if (!this._collections[target]) this._collections[target] = [];
            this._collections[target].push(enriched);
        }

        if (doc.uuid && doc.name) {
            this.nameIndex[doc.uuid] = doc.name;
            if (this.systemData) {
                this.systemData.nameIndex = { ...this.nameIndex };
            }
        }

        return JSON.parse(JSON.stringify(enriched));
    }

    private isFresh(): boolean {
        if (!this.systemData || !this.lastFetch) return false;
        return (Date.now() - this.lastFetch) < this.CACHE_TTL;
    }

    private _getRuleData() {
        return {
            PREDEFINED_EFFECTS: { ...SYSTEM_PREDEFINED_EFFECTS },
            BOON_TYPES: { ...BOON_TYPE_MAP },
            EFFECT_TRANSLATIONS: { ...EFFECT_TRANSLATIONS_MAP },
            DEBUG_SYNC_MS: Date.now()
        };
    }

    private createSkeleton() {
        const skeleton: any = {
            titles: {}
        };

        for (const key of ShadowdarkRegistry.COLLECTIONS) {
            skeleton[key] = [];
        }

        return skeleton;
    }

    private _processShardDocuments(packId: string, docs: any[], results: any, compendiumCache: CompendiumCache, encounteredUuids: Set<string>) {
        const lowerPack = packId.toLowerCase();
        docs.forEach(originalDoc => {
            // Add a temporary UUID for lookup if missing, but DO NOT mutate source if possible
            // Actually, we need a UUID for internal tracking, we clone the doc for our collections
            const doc = { ...originalDoc };
            const id = doc._id || doc.id;
            
            if (!doc.uuid) {
                const isTable = doc.type === 'RollTable' || (doc.results && !doc.type) || lowerPack.includes('rollable-tables');
                const docType = isTable ? 'RollTable' : 'Item';
                doc.uuid = `Compendium.${packId}.${docType}.${id}`;
            }
            doc.pack = packId; 

            if (encounteredUuids.has(doc.uuid)) return;
            encounteredUuids.add(doc.uuid);
            compendiumCache.set(doc.uuid, doc.name);

            const type = (doc.type || "").toLowerCase();
            let category: string | null = null;
            
            // 1. Explicit Type/Pack Keyword Mapping
            category = ShadowdarkRegistry.TYPE_TO_COLLECTION[type] || null;
            
            if (!category) {
                if (lowerPack.includes('ancestries')) category = 'ancestries';
                else if (lowerPack.includes('backgrounds')) category = 'backgrounds';
                else if (lowerPack.includes('classes')) category = 'classes';
                else if (lowerPack.includes('spells')) category = 'spells';
                else if (lowerPack.includes('talents') || lowerPack.includes('class-abilities')) category = 'talents';
                else if (lowerPack.includes('languages')) category = 'languages';
                else if (lowerPack.includes('magic-items')) category = 'magic-items';
                else if (lowerPack.includes('gear')) category = 'gear';
                else if (lowerPack.includes('conditions')) category = 'conditions';
                else if (lowerPack.includes('spell-effects')) category = 'spell-effects';
                else if (lowerPack.includes('properties')) category = 'properties';
                else if (lowerPack.includes('rollable-tables')) category = 'tables';
            }

            // Special handling for combined patrons and deities pack
            if (!category && lowerPack.includes('patrons-and-deities')) {
                const name = (doc.name || "").toLowerCase();
                if (name.includes('patron')) category = 'patrons';
                else category = 'deities';
            }

            if (category && results[category]) {
                if (category === 'languages') {
                    doc.rarity = isRareLanguage(doc.name) ? 'rare' : 'common';
                } else if (category === 'classes' && doc.system?.titles) {
                    results.titles[doc.name] = doc.system.titles;
                }
                results[category].push(doc);
            } else if (!category) {
                // Secondary fallback for Item types
                if (['item', 'weapon', 'armor'].includes(type)) {
                    results.gear.push(doc);
                }
            }
            
            // Ensure RollTables are pushed to results.tables if not already categorized
            if (type === 'rolltable' || (doc.results && !category)) {
                if (!results.tables.includes(doc)) {
                    results.tables.push(doc);
                }
            }
        });
    }
}

export const shadowdarkRegistry = ShadowdarkRegistry.getInstance();
