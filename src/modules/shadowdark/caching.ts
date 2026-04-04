import { logger } from '../../core/logger';

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
     * Finalize and store system data.
     */
    setSystemData(data: any): void {
        this.systemData = data;
        this.lastSystemFetch = Date.now();
    }
}
