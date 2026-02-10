import { logger } from '../logger';

// Browser-safe Dynamic Imports
let fs: any = null;
let path: any = null;
const isBrowser = typeof window !== 'undefined';

async function loadDeps() {
    if (isBrowser) return false;
    if (fs && path) return true;
    try {
        // Use node: prefix and dynamic import to satisfy both ESM and Bundlers
        const fsMod = await import('node:fs');
        const pathMod = await import('node:path');
        fs = fsMod.default || fsMod;
        path = pathMod.default || pathMod;
        return true;
    } catch (e) {
        logger.error('PersistentCache | Failed to load Node.js modules:', e);
        return false;
    }
}

export class PersistentCache {
    private static instance: PersistentCache;
    private baseDir: string | null = null;
    private initPromise: Promise<void> | null = null;

    private constructor() { }

    public static getInstance(): PersistentCache {
        if (!PersistentCache.instance) {
            PersistentCache.instance = new PersistentCache();
        }
        return PersistentCache.instance;
    }

    private async ensureInitialized() {
        if (isBrowser) return;
        if (this.baseDir) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            if (await loadDeps()) {
                try {
                    this.baseDir = path.join(process.cwd(), '.data', 'cache');
                    if (!fs.existsSync(this.baseDir)) {
                        fs.mkdirSync(this.baseDir, { recursive: true });
                    }
                } catch (e) {
                    logger.error('PersistentCache | Failed to initialize base directory:', e);
                }
            }
        })();

        return this.initPromise;
    }

    private async getFilePath(namespace: string, key: string): Promise<string | null> {
        await this.ensureInitialized();
        if (isBrowser || !this.baseDir || !fs || !path) return null;

        const nsDir = path.join(this.baseDir, namespace);
        if (!fs.existsSync(nsDir)) {
            try {
                fs.mkdirSync(nsDir, { recursive: true });
            } catch (e) {
                return null;
            }
        }
        return path.join(nsDir, `${key}.json`);
    }

    public async set<T>(namespace: string, key: string, data: T): Promise<void> {
        if (isBrowser) return;
        const filePath = await this.getFilePath(namespace, key);
        if (!filePath || !fs) return;

        const tempPath = `${filePath}.${Date.now()}.tmp`;

        try {
            const content = JSON.stringify(data, null, 2);
            await fs.promises.writeFile(tempPath, content, 'utf-8');
            await fs.promises.rename(tempPath, filePath);
            logger.debug(`PersistentCache | Saved ${namespace}/${key}`);
        } catch (error) {
            logger.error(`PersistentCache | Failed to save ${namespace}/${key}:`, error);
            if (fs.existsSync && fs.existsSync(tempPath)) {
                await fs.promises.unlink(tempPath).catch(() => { });
            }
            throw error;
        }
    }

    public async get<T>(namespace: string, key: string): Promise<T | null> {
        if (isBrowser) return null;
        const filePath = await this.getFilePath(namespace, key);

        if (!filePath || !fs || !fs.existsSync(filePath)) {
            return null;
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(content) as T;
        } catch (error) {
            logger.error(`PersistentCache | Failed to read ${namespace}/${key}:`, error);
            return null;
        }
    }

    public async remove(namespace: string, key: string): Promise<void> {
        if (isBrowser) return;
        const filePath = await this.getFilePath(namespace, key);
        if (filePath && fs && fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath).catch((err: any) => {
                logger.error(`PersistentCache | Failed to remove ${namespace}/${key}:`, err);
            });
        }
    }

    public async clearNamespace(namespace: string): Promise<void> {
        await this.ensureInitialized();
        if (isBrowser || !this.baseDir || !fs || !path) return;
        const nsDir = path.join(this.baseDir, namespace);
        if (fs.existsSync(nsDir)) {
            await fs.promises.rm(nsDir, { recursive: true, force: true }).catch((err: any) => {
                logger.error(`PersistentCache | Failed to clear namespace ${namespace}:`, err);
            });
        }
    }
}

export const persistentCache = PersistentCache.getInstance();
