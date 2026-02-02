import { io, Socket } from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';

export interface WorldUser {
    _id: string;
    name: string;
    role: number;
}

export interface WorldData {
    worldId: string;
    worldTitle: string;
    systemId: string;
    backgroundUrl: string | null;
    users: WorldUser[];
    lastUpdated: string;
}

export interface CacheData {
    worlds: Record<string, WorldData>;
    currentWorldId: string | null;
}

const CACHE_FILE = path.join(process.cwd(), '.foundry-cache.json');
const CACHE_MAX_AGE_DAYS = 7;

export class SetupScraper {
    /**
     * Scrape available worlds from the /setup page
     */
    static async scrapeAvailableWorlds(foundryUrl: string): Promise<Partial<WorldData>[]> {
        try {
            const baseUrl = foundryUrl.endsWith('/') ? foundryUrl.slice(0, -1) : foundryUrl;
            const response = await fetch(`${baseUrl}/setup`, {
                headers: { 'User-Agent': 'SheetDelver/1.0' }
            });

            if (!response.ok) return [];

            const html = await response.text();
            const worlds: Partial<WorldData>[] = [];

            // Regex to find world entries (simplified for robustness)
            // Matches: <li ... data-package-id="world-id"> ... <h4 class="package-title">World Title</h4>
            const worldBlockRegex = /<li[^>]+data-package-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g;
            const titleRegex = /<h4[^>]*class="package-title"[^>]*>([^<]+)<\/h4>/;
            const systemRegex = /<div[^>]*class="package-metadata"[^>]*>([\s\S]*?)<\/div>/;

            let match;
            while ((match = worldBlockRegex.exec(html)) !== null) {
                const id = match[1];
                const content = match[2];

                const titleMatch = titleRegex.exec(content);
                const title = titleMatch ? titleMatch[1].trim() : id;

                // Try to loosely find system
                const sysMatch = content.match(/System:\s*([\w-]+)/i);
                const systemId = sysMatch ? sysMatch[1] : 'unknown';

                worlds.push({
                    worldId: id,
                    worldTitle: title,
                    systemId: systemId,
                    users: []
                });
            }

            return worlds;
        } catch (e) {
            console.error('[SetupScraper] Failed to scrape setup page:', e);
            return [];
        }
    }

    /**
     * Scrape world data from an authenticated Foundry session
     */
    static async scrapeWorldData(foundryUrl: string, sessionCookie: string): Promise<WorldData> {
        const baseUrl = foundryUrl.endsWith('/') ? foundryUrl.slice(0, -1) : foundryUrl;

        // 1. Fetch /game page to get world info and background
        const gameResponse = await fetch(`${baseUrl}/game`, {
            headers: {
                'Cookie': sessionCookie,
                'User-Agent': 'SheetDelver/1.0'
            }
        });

        if (!gameResponse.ok) {
            throw new Error(`Failed to fetch /game page: ${gameResponse.status}`);
        }

        const html = await gameResponse.text();

        // Parse world title
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const worldTitle = titleMatch ? titleMatch[1].trim() : 'Unknown World';

        // Parse background URL
        const cssVarMatch = html.match(/--background-url:\s*url\((['"]?)(.*?)\1\)/i);
        const bgImageMatch = html.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);

        let backgroundUrl: string | null = null;
        if (cssVarMatch) {
            backgroundUrl = cssVarMatch[2].trim();
        } else if (bgImageMatch) {
            backgroundUrl = bgImageMatch[2].trim();
        }

        if (backgroundUrl && !backgroundUrl.startsWith('http')) {
            const path = backgroundUrl.startsWith('/') ? backgroundUrl : `/${backgroundUrl}`;
            backgroundUrl = `${baseUrl}${path}`;
        }

        // 2. Connect socket with session to get world ID and user list
        const socket = await this.connectSocket(baseUrl, sessionCookie);

        try {
            console.log('[SetupScraper] Socket connected, waiting for session event...');

            // Wait for session event (this confirms authentication)
            const sessionData = await new Promise<any>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error('[SetupScraper] Session event timeout');
                    reject(new Error('Session timeout - authentication may have failed'));
                }, 15000);

                socket.on('session', (data) => {
                    console.log('[SetupScraper] Session event received:', data);
                    clearTimeout(timeout);
                    resolve(data);
                });
            });

            console.log('[SetupScraper] Emitting getJoinData...');

            // Emit getJoinData to fetch user list and world info
            const joinData = await new Promise<any>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error('[SetupScraper] getJoinData timeout');
                    reject(new Error('getJoinData timeout - server may not be responding'));
                }, 15000);

                socket.emit('getJoinData', (data: any) => {
                    console.log('[SetupScraper] getJoinData response received');
                    clearTimeout(timeout);
                    resolve(data);
                });
            });

            const worldId = joinData.world?.id || sessionData.worldId || 'unknown';
            const systemId = joinData.system?.id || 'unknown';
            const users: WorldUser[] = (joinData.users || []).map((u: any) => ({
                _id: u._id,
                name: u.name,
                role: u.role
            }));

            console.log(`[SetupScraper] Successfully scraped: ${users.length} users from world ${worldId}`);

            socket.disconnect();

            return {
                worldId,
                worldTitle,
                systemId,
                backgroundUrl,
                users,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('[SetupScraper] Error during scraping:', error);
            socket.disconnect();
            throw error;
        }
    }

    /**
     * Connect socket with authenticated session
     */
    private static async connectSocket(baseUrl: string, sessionCookie: string): Promise<Socket> {
        // Parse session cookie - handle both "session=value" and just "value" formats
        let sessionId: string | null = null;

        if (sessionCookie.includes('=')) {
            // Format: "session=s%3A..." or "Cookie: session=s%3A..."
            const match = sessionCookie.match(/(?:session|foundry)=([^;]+)/);
            sessionId = match ? match[1] : null;
        } else {
            // Just the value itself
            sessionId = sessionCookie.trim();
        }

        if (!sessionId) {
            throw new Error('Invalid session cookie format');
        }

        console.log('[SetupScraper] Connecting socket with session ID:', sessionId.substring(0, 20) + '...');

        return new Promise((resolve, reject) => {
            const socket = io(baseUrl, {
                path: '/socket.io',
                transports: ['websocket'],
                reconnection: false,
                query: { session: sessionId },
                auth: { session: sessionId },
                extraHeaders: {
                    'Cookie': `session=${sessionId}`,
                    'User-Agent': 'SheetDelver/1.0'
                },
                withCredentials: true
            });

            socket.on('connect', () => {
                console.log('[SetupScraper] Socket connected successfully');
                resolve(socket);
            });

            socket.on('connect_error', (err) => {
                console.error('[SetupScraper] Socket connection error:', err.message);
                reject(err);
            });

            setTimeout(() => {
                console.error('[SetupScraper] Socket connection timeout');
                reject(new Error('Socket connection timeout'));
            }, 10000);
        });
    }

    /**
     * Save world data to cache
     */
    static async saveCache(worldData: WorldData): Promise<void> {
        let cache: CacheData;

        try {
            const existing = await fs.readFile(CACHE_FILE, 'utf-8');
            cache = JSON.parse(existing);
        } catch {
            cache = { worlds: {}, currentWorldId: null };
        }

        cache.worlds[worldData.worldId] = worldData;
        cache.currentWorldId = worldData.worldId;

        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    }

    /**
     * Load all cached worlds
     */
    static async loadCache(): Promise<CacheData> {
        try {
            const data = await fs.readFile(CACHE_FILE, 'utf-8');
            const cache = JSON.parse(data);

            // Validate that the current world actually has users
            if (cache.currentWorldId && cache.worlds[cache.currentWorldId]) {
                const world = cache.worlds[cache.currentWorldId];
                if (!world.users || world.users.length === 0) {
                    console.warn(`[SetupScraper] Cache exists for ${world.worldTitle} but has 0 users. Treating as invalid/setup-required.`);
                    // We don't delete the file, but we treat it as "no current world" so the app redirects to setup
                    return { ...cache, currentWorldId: null };
                }
            }

            return cache;
        } catch {
            return { worlds: {}, currentWorldId: null };
        }
    }

    /**
     * Get cached world data by ID
     */
    static async getCachedWorld(worldId: string): Promise<WorldData | null> {
        const cache = await this.loadCache();
        return cache.worlds[worldId] || null;
    }

    /**
     * Validate cache freshness (< 7 days old)
     */
    static async validateCache(worldId: string): Promise<boolean> {
        const world = await this.getCachedWorld(worldId);
        if (!world) return false;

        const lastUpdated = new Date(world.lastUpdated);
        const now = new Date();
        const ageInDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

        return ageInDays < CACHE_MAX_AGE_DAYS;
    }

    /**
     * Detect current world ID from Foundry server
     */
    static async getCurrentWorldId(foundryUrl: string, sessionCookie: string): Promise<string | null> {
        try {
            const socket = await this.connectSocket(foundryUrl, sessionCookie);

            const sessionData = await new Promise<any>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Session timeout')), 5000);
                socket.on('session', (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });

            socket.disconnect();
            return sessionData.worldId || null;
        } catch {
            return null;
        }
    }
}
