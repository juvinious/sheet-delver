import { logger } from '../../core/logger';
import { DataManager } from './data/DataManager';
import { ShadowdarkCache } from './caching';
import { createHash } from 'node:crypto';

/**
 * Service to handle the discovery and initialization of system-wide data
 * (classes, ancestries, spells, etc.) for Shadowdark.
 */
export class ShadowdarkDiscovery {
    private static pendingFetch: Promise<any> | null = null;
    private static readonly CACHE_NS = 'shadowdark';
    private static readonly SYSTEM_DATA_KEY = 'system-data';
    private static readonly SYSTEM_DATA_SIG_KEY = 'system-data-sig';

    /**
     * Discovers all system data from local packs and the Foundry server.
     */
    static async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        const cache = ShadowdarkCache.getInstance();
        
        if (cache.isSystemDataFresh()) {
            return cache.systemData;
        }

        if (this.pendingFetch) return this.pendingFetch;

        this.pendingFetch = (async () => {
            let results: any = null;
            try {
                // Initialize base results from system info
                const sysInfo = await client.getSystem();
                results = this._initializeResults(sysInfo);
                
                if (options?.minimal) return results;

                const { persistentCache } = await import('../../core/cache/PersistentCache');
                const currentSig = await this._computeSignature(client);
                const storedSig = await persistentCache.get<string>(this.CACHE_NS, this.SYSTEM_DATA_SIG_KEY);

                if (currentSig && storedSig && currentSig === storedSig) {
                    const diskData = await persistentCache.get<any>(this.CACHE_NS, this.SYSTEM_DATA_KEY);
                    if (diskData) {
                        diskData.PREDEFINED_EFFECTS = results.PREDEFINED_EFFECTS;
                        cache.setSystemData(diskData);
                        return diskData;
                    }
                }

                // Deep Discovery
                const processedUuids = new Set<string>();
                const dataManager = DataManager.getInstance();
                
                // 1. From DataManager (Local JSON)
                const allDocs = await dataManager.getAllDocuments();
                this._processDocuments(allDocs, results, processedUuids);

                // 2. From Socket (Remote Foundry)
                // TODO: Link to adapter's socket discovery logic
                
                // 3. World Items
                // TODO: Link to adapter's world-item processing

                if (currentSig) {
                    await persistentCache.set(this.CACHE_NS, this.SYSTEM_DATA_KEY, results);
                    await persistentCache.set(this.CACHE_NS, this.SYSTEM_DATA_SIG_KEY, currentSig);
                }
                
                cache.setSystemData(results);
                return results;
            } catch (e) {
                logger.error('[ShadowdarkDiscovery] Discovery failed:', e);
                return cache.systemData || results || {};
            } finally {
                this.pendingFetch = null;
            }
        })();

        return this.pendingFetch;
    }

    private static _initializeResults(sysInfo: any) {
        return {
            system: sysInfo,
            ancestries: [],
            classes: [],
            backgrounds: [],
            deities: [],
            patrons: [],
            languages: [],
            spells: [],
            talents: [],
            titles: {},
            PREDEFINED_EFFECTS: {} // Source from talent-effects.ts if needed
        };
    }

    private static async _computeSignature(client: any): Promise<string | null> {
        try {
            const sys = await client.getSystem();
            const world = await client.getWorldStatus?.() || 'unknown';
            const sig = `${sys.version}-${world}`;
            return createHash('md5').update(sig).digest('hex');
        } catch (e) {
            return null;
        }
    }

    private static _processDocuments(docs: any[], results: any, processed: Set<string>) {
        docs.forEach(doc => {
            const uuid = doc.uuid;
            if (!uuid || processed.has(uuid)) return;
            processed.add(uuid);

            const type = (doc.type || doc.documentType || "").toLowerCase();
            switch (type) {
                case 'ancestry': results.ancestries.push(doc); break;
                case 'class': 
                    results.classes.push(doc); 
                    if (doc.system?.titles) results.titles[doc.name] = doc.system.titles;
                    break;
                case 'background': results.backgrounds.push(doc); break;
                case 'deity': results.deities.push(doc); break;
                case 'patron': results.patrons.push(doc); break;
                case 'language': results.languages.push(doc); break;
                case 'spell': results.spells.push(doc); break;
                case 'talent': results.talents.push(doc); break;
            }
        });
    }
}
