import { logger } from '@/core/logger';
import { isRareLanguage } from './rules';
import { ShadowdarkCache } from './caching';
import { SYSTEM_PREDEFINED_EFFECTS } from '../data/talent-effects';

/**
 * Service to handle the discovery and initialization of system-wide data
 * (classes, ancestries, spells, etc.) for Shadowdark.
 */
export class ShadowdarkDiscovery {
    private static pendingFetch: Promise<any> | null = null;
    private static readonly CACHE_NS = 'shadowdark';
    private static _appVersion: string | null = null;
    private static readonly BASE_DATA_KEY = 'system-data-v3';
    private static readonly BASE_SIG_KEY = 'system-data-sig';

    // List of core Shadowdark compendium packs to discover
    private static readonly DISCOVERY_PACKS = [
        { id: 'shadowdark.ancestries', type: 'Item' },
        { id: 'shadowdark.backgrounds', type: 'Item' },
        { id: 'shadowdark.classes', type: 'Item' },
        { id: 'shadowdark.class-abilities', type: 'Item' },
        { id: 'shadowdark.conditions', type: 'Item' },
        { id: 'shadowdark.gear', type: 'Item' },
        { id: 'shadowdark.languages', type: 'Item' },
        { id: 'shadowdark.magic-items', type: 'Item' },
        { id: 'shadowdark.patrons-and-deities', type: 'Item' },
        { id: 'shadowdark.spells', type: 'Item' },
        { id: 'shadowdark.talents', type: 'Item' },
        { id: 'shadowdark.rollable-tables', type: 'RollTable' },
        { id: 'shadowdark-community-content.items', type: 'Item' },
        { id: 'shadowdark-community-content.roll-tables', type: 'RollTable' }
    ];

    private static readonly FORCE_DISCOVERY = false;

    /**
     * Discovers all system data directly from the Foundry server.
     */
    static async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        const cache = ShadowdarkCache.getInstance();

        if (!this.FORCE_DISCOVERY && cache.isSystemDataFresh()) {
            return cache.systemData;
        }

        if (this.pendingFetch) return this.pendingFetch;

        this.pendingFetch = (async () => {
            try {
                const { PersistentCache } = await import('@/core/cache/PersistentCache');
                const persistentCache = PersistentCache.getInstance();

                // Fetch the actual Shadowdark system version from the world
                // Implementation Note: client.getSystem() might be empty if called too early in the handshake
                const getIdentifiers = async () => {
                    const system = await client.getSystem?.() || {};
                    const version = system.version || 'unknown';
                    const gameData = (typeof client.getGameData === 'function') ? client.getGameData() : null;
                    const world = gameData?.world?.id || (typeof client.getWorldStatus === 'function' ? await client.getWorldStatus() : 'unknown');
                    return { version, world };
                };

                let { version: systemVersion, world: worldId } = await getIdentifiers();

                if (systemVersion === 'unknown' || worldId === 'unknown') {
                    logger.info(`[ShadowdarkDiscovery] Identifiers unstable (Version: ${systemVersion}, World: ${worldId}). Stabilizing...`);
                    // Short retry loop for version discovery
                    for (let i = 0; i < 5; i++) {
                        await new Promise(r => setTimeout(r, 1000));
                        const next = await getIdentifiers();
                        systemVersion = next.version;
                        worldId = next.world;
                        if (systemVersion !== 'unknown' && worldId !== 'unknown') break;
                    }
                }

                // Use system version for the key (Format: system-data-v.3.6.2)
                const dataKey = `system-data-v.${systemVersion}`;
                const sigKey = `system-data-sig-v.${systemVersion}`;

                const currentSig = await this._computeSignature(client);
                const cachedSig = await persistentCache.get<string>(this.CACHE_NS, sigKey);

                if (!this.FORCE_DISCOVERY && currentSig && cachedSig === currentSig) {
                    const cachedData = await persistentCache.get<any>(this.CACHE_NS, dataKey);
                    if (cachedData && Array.isArray(cachedData.items) && (cachedData.items.length > 0 || cachedData.ancestries?.length > 0)) {
                        logger.debug(`[ShadowdarkDiscovery] Loading system data (v${systemVersion}) from disk cache`);
                        // Restore effects which aren't cached
                        cachedData.PREDEFINED_EFFECTS = { ...SYSTEM_PREDEFINED_EFFECTS };
                        cache.setSystemData(cachedData);
                        return cachedData;
                    }
                } else {
                    logger.debug(`[ShadowdarkDiscovery] Cache signature mismatch or missing. Current: ${currentSig}, Cached: ${cachedSig}`);
                }

                logger.info(`[ShadowdarkDiscovery] Performing Parallel Deep Discovery for Shadowdark v${systemVersion}...`);
                const results = this._initializeResults({});
                const processedUuids = new Set<string>();

                // Fetch all packs sequentially to prevent socket saturation
                for (const packInfo of this.DISCOVERY_PACKS) {
                    try {
                        // Request type and system fields so we don't have a "Blind Discovery"
                        const docs = await client.getPackEntries?.(packInfo.id, { 
                            index: true, 
                            fields: ["type", "system"] 
                        }) || [];
                        if (docs.length > 0) {
                            logger.info(`[ShadowdarkDiscovery] Discovered ${docs.length} entries for pack '${packInfo.id}'`);
                            const mappedDocs = docs.map((d: any) => {
                                const id = d._id || d.id;
                                // MIRROR WORKING LOG FORMAT: Compendium.<scope>.<pack>.Item.<id>
                                // The logs show that Foundry manually sends '.Item.' for these references.
                                const uuid = d.uuid || `Compendium.${packInfo.id}.Item.${id}`;
                                return {
                                    ...d,
                                    pack: packInfo.id,
                                    uuid: uuid
                                };
                            });
                            this._processDocuments(mappedDocs, results, processedUuids);
                        }
                    } catch (err) {
                        logger.warn(`[ShadowdarkDiscovery] Failed to fetch pack ${packInfo.id}:`, err);
                    }
                }

                if (currentSig) {
                    // PURGE OLD CACHE: Delete any existing system-data files that don't match this version
                    try {
                        const fs = await import(/* webpackIgnore: true */ 'node:fs');
                        const path = await import(/* webpackIgnore: true */ 'node:path');
                        const cacheDir = path.join(process.cwd(), '.data', 'cache', this.CACHE_NS);

                        if (fs.existsSync(cacheDir) && systemVersion !== 'unknown') {
                            const files = fs.readdirSync(cacheDir);
                            for (const file of files) {
                                if (file.startsWith('system-data-') && !file.includes(systemVersion)) {
                                    logger.info(`[ShadowdarkDiscovery] Purging stale cache file: ${file}`);
                                    fs.unlinkSync(path.join(cacheDir, file));
                                }
                            }
                        }
                    } catch (purgeError) {
                        logger.warn('[ShadowdarkDiscovery] Cache purge failed (non-critical):', purgeError);
                    }

                    await persistentCache.set(this.CACHE_NS, dataKey, results);
                    await persistentCache.set(this.CACHE_NS, sigKey, currentSig);
                }

                // Final Discovery Summary
                logger.info(`[ShadowdarkDiscovery] Discovery complete. Ancestries: ${results.ancestries.length}, Classes: ${results.classes.length}, Spells: ${results.spells.length}, Items/Gear: ${results.items.length}`);

                cache.setSystemData(results);
                return results;
            } catch (e) {
                logger.error('[ShadowdarkDiscovery] Discovery failed:', e);
                return cache.systemData || ({} as any);
            } finally {
                this.pendingFetch = null;
            }
        })();

        return this.pendingFetch;
    }

    private static async _getAppVersion(): Promise<string> {
        if (this._appVersion) return this._appVersion;
        try {
            const fs = await import(/* webpackIgnore: true */ 'node:fs');
            const path = await import(/* webpackIgnore: true */ 'node:path');
            const pkgPath = path.join(process.cwd(), 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            this._appVersion = pkg.version || '0.0.0';
        } catch (e) {
            this._appVersion = '0.0.0';
        }
        return this._appVersion || '0.0.0';
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
            items: [],
            tables: [],
            titles: {},
            PREDEFINED_EFFECTS: { ...SYSTEM_PREDEFINED_EFFECTS }
        };
    }

    private static async _computeSignature(client: any): Promise<string | null> {
        try {
            // Read version from package.json for cache busting
            const version = await this._getAppVersion();

            // Use stable identifiers from getGameData() if available
            const gameData = (typeof client.getGameData === 'function') ? client.getGameData() : null;
            const worldId = gameData?.world?.id || (typeof client.getWorldStatus === 'function' ? await client.getWorldStatus() : 'unknown');
            const systemId = gameData?.system?.id || 'shadowdark';
            const systemVersion = gameData?.system?.version || 'unknown';
            const packCount = this.DISCOVERY_PACKS.length;

            const sig = `${worldId}-${systemId}-${systemVersion}-${packCount}-${version}`;
            logger.debug(`[ShadowdarkDiscovery] Computing signature: ${sig}`);
            
            if (worldId === 'unknown' || systemVersion === 'unknown') {
                logger.warn(`[ShadowdarkDiscovery] Cannot compute signature - identifiers still 'unknown'`);
                return null;
            }

            const { createHash } = await import(/* webpackIgnore: true */ 'node:crypto');
            return createHash('md5').update(sig).digest('hex');
        } catch (e) {
            logger.error('[ShadowdarkDiscovery] Failed to compute signature:', e);
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
                case 'ancestry':
                    results.ancestries.push(doc);
                    break;
                case 'background':
                    results.backgrounds.push(doc);
                    break;
                case 'class':
                    results.classes.push(doc);
                    if (doc.system?.titles) results.titles[doc.name] = doc.system.titles;
                    break;
                case 'deity':
                    results.deities.push(doc);
                    break;
                case 'patron':
                    results.patrons.push(doc);
                    break;
                case 'language':
                    // Normalize rarity based on user requirements
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
}
