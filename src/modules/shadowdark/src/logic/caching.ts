import { logger } from '@shared/utils/logger';
import { SYSTEM_PREDEFINED_EFFECTS } from '../data/talent-effects';
import { isRareLanguage } from './rules';

export interface SystemDiscoveryManifest {
    systemId: string;
    packs: Record<string, { id: string; hash: string }>;
    _instanceId: string;
}

/**
 * Service to handle in-memory and persistent caching for Shadowdark.
 */
export class ShadowdarkCache {
    private static instance: ShadowdarkCache;
    
    // In-memory system data
    public systemData: any = null;
    public lastSystemFetch: number = 0;
    public readonly SYSTEM_FETCH_INTERVAL = 300000; // 5 minutes
    
    // Actor cache
    private actorCache = new Map<string, { data: any, timestamp: number }>();
    private readonly ACTOR_CACHE_TTL = 60000; // 1 minute
    
    private constructor() {}

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
        return !!this.systemData && (Date.now() - this.lastSystemFetch < this.SYSTEM_FETCH_INTERVAL);
    }

    /**
     * Loads system data by aggregating shards from a storage provider.
     * This follows the 'Load-time Aggregation' strategy.
     */
    async loadSystemData(store?: any): Promise<any> {
        if (this.isSystemDataFresh()) return this.systemData;

        // If no store is provided, we can't load new data from disk
        if (!store) {
            return this.systemData;
        }

        logger.info('ShadowdarkCache | Loading sharded system data...');
        const systemId = 'shadowdark';
        const manifestKey = `manifest-${systemId}`;

        const manifest = await store.get(systemId, manifestKey);
        if (!manifest) {
            logger.warn('ShadowdarkCache | No discovery manifest found. Shards may not be synced.');
            return null;
        }

        const aggregated: any = {
            _instanceId: (manifest as any)._instanceId,
            ancestries: [],
            backgrounds: [],
            classes: [],
            deities: [],
            patrons: [],
            languages: [],
            spells: [],
            talents: [],
            items: [],
            tables: [],
            titles: {},
            PREDEFINED_EFFECTS: { ...SYSTEM_PREDEFINED_EFFECTS }
        };

        const packs = Object.keys((manifest as any).packs);
        for (const packId of packs) {
            const shardKey = `pack-${packId.replace('.', '-')}`;
            const documents = await store.get(systemId, shardKey);

            if (!documents || !Array.isArray(documents)) {
                logger.warn(`ShadowdarkCache | Shard ${shardKey} missing or invalid.`);
                continue;
            }

            this._processShardDocuments(packId, documents, aggregated);
        }

        this.setSystemData(aggregated);
        logger.info(`ShadowdarkCache | Load complete. Shards: ${packs.length}, Classes: ${aggregated.classes.length}, Spells: ${aggregated.spells.length}`);
        
        return aggregated;
    }

    private _processShardDocuments(packId: string, docs: any[], results: any) {
        docs.forEach(doc => {
            // Ensure UUID is present for the cache
            if (!doc.uuid) {
                const id = doc._id || doc.id;
                doc.uuid = `Compendium.${packId}.Item.${id}`;
            }

            const type = (doc.type || "").toLowerCase();
            switch (type) {
                case 'ancestry':
                    results.ancestries.push(doc);
                    break;
                case 'background':
                    results.backgrounds.push(doc);
                    break;
                case 'class':
                    results.classes.push(doc);
                    // Load-time aggregation of titles
                    if (doc.system?.titles) {
                        results.titles[doc.name] = doc.system.titles;
                    }
                    break;
                case 'deity':
                    results.deities.push(doc);
                    break;
                case 'patron':
                    results.patrons.push(doc);
                    break;
                case 'language':
                    doc.rarity = isRareLanguage(doc.name) ? 'rare' : 'common';
                    results.languages.push(doc);
                    break;
                case 'spell':
                    results.spells.push(doc);
                    break;
                case 'talent':
                case 'talent (random)':
                case 'talent (class)':
                case 'class ability':
                case 'class-ability':
                    results.talents.push(doc);
                    break;
                case 'armor':
                case 'weapon':
                case 'basic':
                case 'scroll':
                case 'wand':
                case 'potion':
                case 'gem':
                case 'item':
                case 'property':
                case 'spell-effect':
                case 'effect':
                case 'condition':
                    results.items.push(doc);
                    break;
                case 'rolltable':
                case 'table':
                case 'roll-table':
                    results.tables.push(doc);
                    break;
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
