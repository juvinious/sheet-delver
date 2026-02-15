import { logger } from '../logger';
import { FoundryMetadataClient } from './interfaces';

export class CompendiumCache {
    private static instance: CompendiumCache;
    private cache: Map<string, string> = new Map();
    private initialized = false;
    private loadingPromise: Promise<void> | null = null;

    private constructor() { }

    public static getInstance(): CompendiumCache {
        if (!CompendiumCache.instance) {
            CompendiumCache.instance = new CompendiumCache();
        }
        return CompendiumCache.instance;
    }

    public hasLoaded(): boolean {
        return this.initialized;
    }

    public async initialize(client: FoundryMetadataClient) {
        if (this.initialized) return;
        if (this.loadingPromise) return this.loadingPromise;

        logger.debug('Initializing Compendium Cache...');
        this.loadingPromise = (async () => {
            try {
                const packs = await client.getAllCompendiumIndices();
                for (const pack of packs) {
                    const packId = pack.id;
                    const docType = pack.metadata?.type || pack.metadata?.entity || pack.metadata?.documentName || 'Item';
                    if (!packId || !Array.isArray(pack.index)) continue;

                    for (const item of pack.index) {
                        const id = item._id || item.id;
                        const name = item.name;
                        if (id && name) {
                            // Standardize: Compendium.{packId}.{Type}.{Id}
                            const uuid = `Compendium.${packId}.${docType}.${id}`;
                            this.cache.set(uuid, name);
                        }
                    }
                }
                this.initialized = true;
                logger.debug(`Compendium Cache initialized with ${this.cache.size} items.`);
            } catch (e) {
                logger.error('Failed to initialize Compendium Cache', e);
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    public getName(uuid: string): string | undefined {
        const val = this.cache.get(uuid);
        // if (!val) console.log(`[CompendiumCache] Miss: ${uuid}`);
        return val;
    }

    public getKeys(): string[] {
        return Array.from(this.cache.keys());
    }

    public resolve(text: string): string {
        // Simple replacement for now, or direct lookup
        if (this.cache.has(text)) return this.cache.get(text)!;
        return text;
    }
    public set(uuid: string, name: string): void {
        this.cache.set(uuid, name);
    }

    public reset(): void {
        this.cache.clear();
        this.initialized = false;
        this.loadingPromise = null;
        logger.info('CompendiumCache | Cache cleared.');
    }
}
