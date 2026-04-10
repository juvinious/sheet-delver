import { logger } from '@shared/utils/logger';
import { SYSTEM_PREDEFINED_EFFECTS } from '../data/talent-effects';
import { isRareLanguage } from './rules';
import { CompendiumCache } from '../../../../server/core/foundry/compendium-cache';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Service to handle in-memory and persistent caching for Shadowdark.
 */
export class ShadowdarkCache {
    private static instance: ShadowdarkCache;

    public systemData: any = null;
    public lastSystemFetch: number = 0;
    private aggregationPromise: Promise<any> | null = null;
    public readonly SYSTEM_FETCH_INTERVAL = 300000; // 5 minutes

    // Actor cache
    private actorCache = new Map<string, { data: any, timestamp: number }>();
    private readonly ACTOR_CACHE_TTL = 60000; // 1 minute

    private constructor() { }

    static getInstance(): ShadowdarkCache {
        if (!ShadowdarkCache.instance) {
            ShadowdarkCache.instance = new ShadowdarkCache();
        }
        return ShadowdarkCache.instance;
    }

    /**
     * Get a cached actor if it's still fresh.
     */
    getActor(actorId: string): any | null {
        const cached = this.actorCache.get(actorId);
        if (cached && (Date.now() - cached.timestamp < this.ACTOR_CACHE_TTL)) {
            return cached.data;
        }
        return null;
    }

    /**
     * Store a normalized actor in the cache.
     */
    setActor(actorId: string, data: any): void {
        this.actorCache.set(actorId, { data, timestamp: Date.now() });
    }

    /**
     * Invalidate a specific actor in the cache.
     */
    invalidateActor(actorId: string): void {
        this.actorCache.delete(actorId);
    }

    /**
     * Check if the system data cache is fresh.
     */
    isSystemDataFresh(): boolean {
        if (!this.systemData) return false;
        if (!this.lastSystemFetch) return false;

        const age = Date.now() - this.lastSystemFetch;
        
        // If it's very recent (less than 5s), it's fresh enough to prevent double-fetches
        if (age < 5000) return true;

        // If we have minimal data (backgrounds AND classes), we trust the 5-minute expiration
        const hasMinData = (this.systemData.backgrounds?.length > 0) && (this.systemData.classes?.length > 0);
        if (hasMinData) {
            return age < this.SYSTEM_FETCH_INTERVAL;
        }

        // If the cache is empty, we only consider it "fresh" for 30 seconds 
        // to allow retries during the initial bootstrap phase if discovery was lagging
        return age < 30000;
    }

    /**
     * Loads system data by aggregating shards from a storage provider.
     */
    async loadSystemData(store?: any): Promise<any> {
        const systemId = 'shadowdark';
        if (this.isSystemDataFresh()) return this.systemData;

        // Prevent concurrent aggregation runs
        if (this.aggregationPromise) {
            logger.debug('ShadowdarkCache | Reusing existing aggregation promise...');
            return this.aggregationPromise;
        }

        this.aggregationPromise = (async () => {
            try {
                if (!store) {
                    return this.systemData;
                }

                logger.info('ShadowdarkCache | Loading sharded system data from PersistentCache...');

                // 1. Resolve expected packs from info.json
                let expectedPacks: string[] = [];
                try {
                    const infoPath = path.join(process.cwd(), 'src', 'modules', 'shadowdark', 'info.json');
                    if (fs.existsSync(infoPath)) {
                        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                        if (info?.discovery?.packs) {
                            expectedPacks = info.discovery.packs
                                .filter((p: any) => p.hydrate !== false)
                                .map((p: any) => p.id);
                            
                            // Deduplicate pack list
                            expectedPacks = Array.from(new Set(expectedPacks));
                        }
                    }
                } catch (err) {
                    logger.error('ShadowdarkCache | Failed to load pack list from info.json', err);
                }

                // 2. Initialize aggregation skeleton
                const aggregated: any = {
                    ancestries: [],
                    backgrounds: [],
                    classes: [],
                    deities: [],
                    patrons: [],
                    languages: [],
                    spells: [],
                    talents: [],
                    gear: [],
                    magicItems: [],
                    conditions: [],
                    spellEffects: [],
                    properties: [],
                    documentation: [],
                    macros: [],
                    tables: [],
                    titles: {},
                    PREDEFINED_EFFECTS: { ...SYSTEM_PREDEFINED_EFFECTS }
                };

                const compendiumCache = CompendiumCache.getInstance();
                const encounteredUuids = new Set<string>();
                let loadedPacksCount = 0;

                // 3. Load and process shards
                for (const packId of expectedPacks) {
                    const shardKey = `pack-${packId.replace(/\./g, '-')}`;
                    const documents = await store.get(systemId, shardKey);

                    if (documents && Array.isArray(documents)) {
                        loadedPacksCount++;
                        this._processShardDocuments(packId, documents, aggregated, compendiumCache, encounteredUuids);
                        logger.debug(`ShadowdarkCache | Loaded shard: ${shardKey} (${documents.length} docs)`);
                    }
                }

                // 4. Finalize
                this.setSystemData(aggregated);
                
                logger.info(`ShadowdarkCache | Aggregation complete (${loadedPacksCount} shards). Counts: ` +
                    `Ancestries: ${aggregated.ancestries.length}, ` +
                    `Backgrounds: ${aggregated.backgrounds.length}, ` +
                    `Classes: ${aggregated.classes.length}, ` +
                    `Deities: ${aggregated.deities.length}, ` +
                    `Patrons: ${aggregated.patrons.length}, ` +
                    `Languages: ${aggregated.languages.length}, ` +
                    `Spells: ${aggregated.spells.length}, ` +
                    `Talents: ${aggregated.talents.length}`
                );

                return aggregated;
            } catch (err) {
                logger.error('ShadowdarkCache | Aggregation failed', err);
                throw err;
            } finally {
                this.aggregationPromise = null;
            }
        })();

        return this.aggregationPromise;
    }

    private _processShardDocuments(packId: string, docs: any[], results: any, compendiumCache: CompendiumCache, encounteredUuids: Set<string>) {
        docs.forEach(doc => {
            // 1. Ensure UUID is present and synchronized with core CompendiumCache
            if (!doc.uuid) {
                const id = doc._id || doc.id;
                const docType = doc.type === 'RollTable' ? 'RollTable' : 'Item';
                doc.uuid = `Compendium.${packId}.${docType}.${id}`;
            }

            // Deduplication Check
            if (encounteredUuids.has(doc.uuid)) return;
            encounteredUuids.add(doc.uuid);

            if (doc.uuid && doc.name) {
                compendiumCache.set(doc.uuid, doc.name);
            }

            const lowerPack = packId.toLowerCase();

            // 2. Identify primary category based on pack ID (Identity-driven)
            let category: string | null = null;
            if (lowerPack.includes('ancestries')) category = 'ancestries';
            else if (lowerPack.includes('backgrounds')) category = 'backgrounds';
            else if (lowerPack.includes('classes')) category = 'classes';
            else if (lowerPack.includes('spells')) category = 'spells';
            else if (lowerPack.includes('talents') || lowerPack.includes('class-abilities')) category = 'talents';
            else if (lowerPack.includes('languages')) category = 'languages';
            else if (lowerPack.includes('magic-items')) category = 'magicItems';
            else if (lowerPack.includes('gear')) category = 'gear';
            else if (lowerPack.includes('conditions')) category = 'conditions';
            else if (lowerPack.includes('spell-effects')) category = 'spellEffects';

            // 3. Classify based on identity (Pack) or fallback to document type
            const type = (doc.type || "").toLowerCase();

            // Special Case: Patrons and Deities (Always requires name heuristics due to combined pack)
            if (lowerPack.includes('patrons-and-deities')) {
                const name = (doc.name || "").toLowerCase();
                const isPatron = name.includes('patron');
                const isDeity = name.includes('deity') || name.includes('god') || name.includes('saint');
                
                if (isPatron && !isDeity) results.patrons.push(doc);
                else if (isDeity && !isPatron) results.deities.push(doc);
                else {
                    results.deities.push(doc);
                    results.patrons.push(doc);
                }
                return;
            }

            // Route to identified category if it's a generic Item or specific match
            if (category && results[category]) {
                if (category === 'languages') {
                    try {
                        doc.rarity = isRareLanguage(doc.name) ? 'rare' : 'common';
                        results.languages.push(doc);
                        logger.debug(`ShadowdarkCache | Categorized language: ${doc.name} (${doc.rarity})`);
                    } catch (e) {
                        logger.warn(`ShadowdarkCache | Error processing language ${doc.name}:`, e);
                        results.languages.push(doc);
                    }
                } else if (category === 'classes' && doc.system?.titles) {
                    results.titles[doc.name] = doc.system.titles;
                    results[category].push(doc);
                } else {
                    results[category].push(doc);
                }
                return;
            }

            // Fallback: Type-based classification (for unusual docs or non-standard packs)
            switch (type) {
                case 'ancestry': results.ancestries.push(doc); break;
                case 'background': results.backgrounds.push(doc); break;
                case 'class': results.classes.push(doc); break;
                case 'spell': results.spells.push(doc); break;
                case 'talent': case 'class-ability': results.talents.push(doc); break;
                case 'condition': results.conditions.push(doc); break;
                case 'spell-effect': results.spellEffects.push(doc); break;
                case 'rolltable': case 'table': results.tables.push(doc); break;
                case 'macro': results.macros.push(doc); break;
                case 'property': results.properties.push(doc); break;
                case 'journalentry': case 'journal': results.documentation.push(doc); break;
                default:
                    // Treat any standard item-like type as gear if category wasn't identified by pack
                    if (['item', 'weapon', 'armor', 'basic', 'scroll', 'wand', 'potion', 'gem'].includes(type)) {
                        results.gear.push(doc);
                    }
            }
        });
    }

    /**
     * Finalize and store system data.
     */
    setSystemData(data: any): void {
        this.systemData = data;
        this.lastSystemFetch = Date.now();
    }
}
