import path from 'node:path';

/**
 * Centralized path resolution for Shadowdark module assets and data.
 */
export class ModulePaths {
    private static readonly MODULE_ROOT = 'src/modules/shadowdark';

    /**
     * Get the absolute path to the data packs directory.
     */
    static getPacksDir(): string {
        return path.join(process.cwd(), this.MODULE_ROOT, 'data/packs');
    }

    /**
     * Get the absolute path to the shadowdarkling mappings.
     */
    static getShadowdarklingDir(): string {
        return path.join(process.cwd(), this.MODULE_ROOT, 'data/shadowdarkling');
    }

    /**
     * Get the absolute path to the system data cache file.
     */
    static getSystemCacheFile(): string {
        return path.join(process.cwd(), '.shadowdark-system-cache.json');
    }
}
