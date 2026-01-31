import { FoundryClient } from './client';

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

    public async initialize(client: FoundryClient) {
        if (this.initialized) return;
        if (this.loadingPromise) return this.loadingPromise;

        console.log('Initializing Compendium Cache...');
        this.loadingPromise = (async () => {
            try {
                const packs = await client.getAllCompendiumIndices();
                for (const pack of packs) {
                    for (const item of pack.index) {
                        if (item.uuid) {
                            this.cache.set(item.uuid, item.name);
                        }
                    }
                }
                this.initialized = true;
                console.log(`Compendium Cache initialized with ${this.cache.size} items.`);
            } catch (e) {
                console.error('Failed to initialize Compendium Cache', e);
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    public getName(uuid: string): string | undefined {
        return this.cache.get(uuid);
    }

    public resolve(text: string): string {
        // Simple replacement for now, or direct lookup
        if (this.cache.has(text)) return this.cache.get(text)!;
        return text;
    }
}
