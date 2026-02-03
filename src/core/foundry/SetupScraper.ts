import { io, Socket } from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

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
        let worldTitle = titleMatch ? titleMatch[1].trim() : 'Unknown World';

        // Strip Foundry prefix
        worldTitle = worldTitle.replace(/^Foundry Virtual Tabletop [\u2022\u00B7\-|]\s*/i, '');

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
     * Probes for an active world using credentials.
     * Useful when the world is already running but we don't know which one.
     */
    static async probeActiveWorld(baseUrl: string, username: string, password?: string): Promise<{ world: any, cookie: string } | null> {
        try {
            logger.info(`SetupScraper | Probing active world with user ${username}...`);
            const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

            // 1. GET /join to get CSRF and session
            const getResponse = await fetch(`${url}/join`, {
                headers: { 'User-Agent': 'SheetDelver/1.0' }
            });
            const html = await getResponse.text();

            const cookie = getResponse.headers.get('set-cookie');
            const getSessionId = cookie ? /session=([^;]+)/.exec(cookie)?.[1] : null;

            // 2. Parse CSRF and World Title from HTML
            const titleMatch = html.match(/<title>(.*?)<\/title>/) || html.match(/<h1>(.*?)<\/h1>/);
            let worldTitleFromHtml = titleMatch ? titleMatch[1].trim() : null;
            if (worldTitleFromHtml === 'Foundry Virtual Tabletop') worldTitleFromHtml = null;

            const csrfMatch = html.match(/name="csrf-token" content="(.*?)"/) || html.match(/"csrfToken":"(.*?)"/);
            const csrfToken = csrfMatch ? csrfMatch[1] : null;

            // 3. Parse User ID for the username
            let userId: string | null = null;
            const userMatch = new RegExp(`<option[^>]+value="([^"]+)"[^>]*>\\s*${username}\\s*</option>`, 'i').exec(html);
            if (userMatch) {
                userId = userMatch[1];
                logger.info(`!!! SetupScraper | Found User ID for ${username}: ${userId}`);
            } else {
                userId = username;
            }

            // 4. POST to /join to authenticate
            const response = await fetch(`${url}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'User-Agent': 'SheetDelver/1.0',
                    'Origin': url,
                    'Referer': `${url}/join`
                },
                body: JSON.stringify({
                    userid: userId,
                    password: password || '',
                    action: 'join',
                    'csrf-token': csrfToken
                }),
                redirect: 'manual'
            });

            const postBody = await response.text();
            logger.info(`!!! SetupScraper | POST /join status: ${response.status}`);

            // Check for success markers in body if 200
            const isJsonSuccess = response.status === 200 && (postBody.includes('"status":"success"') || postBody.includes('JOIN.LoginSuccess'));
            const isRedirect = response.status === 302;

            if (response.status === 401 || (!isRedirect && !isJsonSuccess && !response.headers.get('set-cookie') && !cookie)) {
                logger.warn(`!!! SetupScraper | Auth might have failed. Status: ${response.status}, Success: ${isJsonSuccess}`);
                if (postBody.length < 500) logger.debug(`!!! SetupScraper | POST Body: ${postBody}`);
            }

            // Capture ALL cookies, prioritizing new ones
            const cookieMap = new Map<string, string>();
            const parseCookies = (c: string | null) => {
                if (!c) return;
                c.split(',').forEach(part => {
                    const pair = part.split(';')[0].split('=');
                    if (pair.length >= 2) cookieMap.set(pair[0].trim(), pair[1].trim());
                });
            };

            parseCookies(cookie);
            parseCookies(response.headers.get('set-cookie'));

            const combinedCookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
            const sessionId = cookieMap.get('session') || cookieMap.get('foundry') || getSessionId;

            if (!sessionId) {
                logger.warn('!!! SetupScraper | Failed to capture session ID for probe.');
                return null;
            }

            // 5. Connect via Socket and wait for authentication
            logger.info(`!!! SetupScraper | Connecting to socket with sessionId: ${sessionId}`);
            const socket = await this.connectSocket(url, combinedCookie);

            // Wait for session event before getJoinData
            const sessionData = await new Promise<any>((resolve, reject) => {
                const t = setTimeout(() => {
                    logger.warn(`!!! SetupScraper | session event TIMED OUT after 10s`);
                    reject(new Error('session event timeout'));
                }, 10000);

                socket.on('session', (data) => {
                    clearTimeout(t);
                    logger.info(`!!! SetupScraper | Session event received for userId: ${data.userId}`);
                    resolve(data);
                });
            });

            logger.info(`!!! SetupScraper | Socket authenticated. Emitting getJoinData...`);

            const joinData = await new Promise<any>((resolve, reject) => {
                const t = setTimeout(() => {
                    logger.warn(`!!! SetupScraper | getJoinData TIMED OUT after 5s`);
                    reject(new Error('getJoinData timeout'));
                }, 5000);

                socket.emit('getJoinData', (result: any) => {
                    clearTimeout(t);
                    logger.info(`!!! SetupScraper | getJoinData RECEIVED result: ${result ? 'YES' : 'NO'}`);
                    resolve(result);
                });
            });

            socket.disconnect();

            if (joinData) {
                logger.debug(`!!! SetupScraper | joinData keys: ${Object.keys(joinData).join(', ')}`);
                if (joinData.world) {
                    logger.info(`!!! SetupScraper | PROBE SUCCESS! World: ${joinData.world.title}`);
                }
            }

            if (joinData?.world || (worldTitleFromHtml && worldTitleFromHtml !== 'Critical Failure!')) {
                const isReady = !!joinData?.world;
                return {
                    world: {
                        worldId: joinData?.world?.id || 'unknown',
                        worldTitle: joinData?.world?.title || worldTitleFromHtml,
                        systemId: joinData?.system?.id || 'unknown',
                        status: isReady ? 'active' : 'offline',
                        source: 'Authenticated Probe'
                    },
                    cookie: combinedCookie
                };
            } else {
                logger.warn(`!!! SetupScraper | PROBE FAILED: No world found. Title from HTML: ${worldTitleFromHtml}`);
            }
        } catch (e: any) {
            logger.warn(`!!! SetupScraper | PROBE EXCEPTION: ${e.message}`);
        }
        return null;
    }

    /**
     * TODO: Implement authenticated setup page scraping if needed.
     * Currently focusing on world-specific probes.
     */
    static async scrapeAvailableWorlds(foundryUrl: string, sessionCookie?: string): Promise<Partial<WorldData>[]> {
        // Placeholder for future implementation
        return [];
    }

    /**
     * Connect socket with authenticated session
     */
    private static async connectSocket(baseUrl: string, sessionCookie: string): Promise<Socket> {
        if (!sessionCookie) {
            throw new Error('[SetupScraper] Session cookie is required for socket connection.');
        }

        let sessionId: string | undefined;

        // Handle "session=s%3A...; other=..." or just "s%3A..."
        const match = sessionCookie.match(/(?:session|foundry)=([^; ]+)/);
        if (match) {
            sessionId = match[1];
        } else if (!sessionCookie.includes('=')) {
            sessionId = sessionCookie.trim();
        }

        const headers = {
            'Cookie': sessionCookie,
            'User-Agent': 'SheetDelver/1.0',
            'Origin': baseUrl
        };

        return new Promise((resolve, reject) => {
            const socket = io(baseUrl, {
                path: '/socket.io',
                transports: ['websocket'],
                reconnection: false,
                query: sessionId ? { session: sessionId } : {},
                auth: sessionId ? { session: sessionId } : {},
                extraHeaders: headers,
                transportOptions: {
                    websocket: {
                        extraHeaders: headers
                    }
                },
                withCredentials: true
            });

            const timeout = setTimeout(() => {
                socket.disconnect();
                reject(new Error('Socket connection timeout'));
            }, 10000);

            socket.on('connect', () => {
                clearTimeout(timeout);
                console.log('[SetupScraper] Socket connected successfully');
                resolve(socket);
            });

            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                socket.disconnect();
                console.error('[SetupScraper] Socket connection error:', err.message);
                reject(err);
            });
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
