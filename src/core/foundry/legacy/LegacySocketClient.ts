import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FoundryConfig } from '../types';
import { FoundryClient, SystemInfo } from '../interfaces';
import { ConnectionStatus, ServerConnectionStatus } from '@/shared/connection';
import { getAdapter } from '../../../modules/core/registry';
import { SystemAdapter } from '../../../modules/core/interfaces';
import { SetupScraper, WorldData, CacheData } from '../SetupScraper';
import { logger } from '../../logger';
import { CompendiumCache } from '../compendium-cache';
import fs from 'fs';
import path from 'path';

/**
 * @deprecated Use CoreSocket and ClientSocket instead.
 */
export class LegacySocketFoundryClient implements FoundryClient {
    private config: FoundryConfig;
    private adapter: SystemAdapter | null = null;
    private socket: Socket | null = null;
    private sessionCookie: string | null = null;
    private isJoining: boolean = false;
    private isShuttingDown: boolean = false;
    private discoveredUserId: string | null = null;
    public userId: string | null = null;
    public isExplicitSession: boolean = false;
    public isSystemClient: boolean = false;
    public onSessionInvalidated: (() => void) | null = null;
    // isConnected is now a computed getter in the strict architecture

    // Strict Separation Implementation
    public isSocketConnected: boolean = false;
    public worldState: 'offline' | 'setup' | 'active' = 'offline';

    // Cache SetupScraper Data
    private cachedWorlds: Record<string, WorldData> = {};
    private cachedWorldData: WorldData | null = null;

    get isUserAuthenticated(): boolean {
        return this.isExplicitSession;
    }

    // Strict strict means "Socket is Open"
    get isConnected(): boolean {
        return this.isSocketConnected;
    }
    // Interface implementation (LEGACY) - Aliases to new strict properties
    get isLoggedIn(): boolean {
        // We are NOT logged in if we are explicitly in setup mode
        if (this.worldState === 'setup') return false;

        // Intent: We have an explicit session flag set (restored or logged in)
        if (this.isExplicitSession) return true;

        // Reality: Socket is connected and we identified a user during the session event
        return !!this.userId && this.isSocketConnected;
    }
    private worldTitleFromHtml: string | null = null;
    private worldBackgroundFromHtml: string | null = null;
    private validationFailCount: number = 0;
    private consecutiveFailures: number = 0;
    private cookieMap = new Map<string, string>();

    private updateCookies(headerVal: string | string[] | null | undefined) {
        if (!headerVal) return;
        const cookies = Array.isArray(headerVal) ? headerVal : [headerVal];

        cookies.forEach(c => {
            // Split multiple cookies if they are comma separated (common in simple fetch)
            const parts = c.split(/,(?=\s*\w+=)/g);
            parts.forEach(part => {
                const [pair] = part.split(';');
                if (pair.includes('=')) {
                    const [key, value] = pair.split('=');
                    this.cookieMap.set(key.trim(), value.trim());
                }
            });
        });

        // Update the main session string
        this.sessionCookie = Array.from(this.cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    public isAuthenticating: boolean = false;
    private activeModules: any[] = [];
    private gameDataCache: any = null;

    // Shared UI Content State
    public sharedContent: { type: 'image' | 'journal', data: any, timestamp: number } | null = null;

    public getSharedContent() {
        if (!this.sharedContent) return null;

        // TTL: 2 Minutes (120000 ms)
        const TTL = 2 * 60 * 1000;
        if (Date.now() - this.sharedContent.timestamp > TTL) {
            this.sharedContent = null; // Expire it
            return null;
        }

        return this.sharedContent;
    }

    // Computed state getters
    get isSetupMode(): boolean { return this.worldState === 'setup'; }
    get isWorldReady(): boolean { return this.worldState === 'active'; }
    set isSetupMode(v: boolean) { if (v) this.worldState = 'setup'; }
    set isWorldReady(v: boolean) { if (v) this.worldState = 'active'; }

    public lastLaunchActivity: number = 0;
    private lastCacheReload: number = 0;
    // Setup/Ready flags are now computed from worldState
    private disconnectReason: string | null = null;
    private readonly STARTUP_WINDOW_MS = 30000; // 30 seconds
    private userMap: Map<string, any> = new Map();
    private actorCache: Map<string, string> = new Map();
    private worldCache: Map<string, Partial<SystemInfo>> = new Map();
    constructor(config: FoundryConfig, isSystemClient: boolean = false) {
        this.config = config;
        this.isSystemClient = isSystemClient;
        this.loadInitialCache();
    }

    private async loadInitialCache() {
        try {
            await this.reloadCache();

            // Watch for external cache updates (e.g. from Admin CLI)
            // Use simple fs.watch (debounce if possible, but for this simple json simple watch is fine)
            const CACHE_FILE = path.join(process.cwd(), '.foundry-cache.json');

            if (fs.existsSync(CACHE_FILE)) {
                let fsWait: NodeJS.Timeout | null = null;
                fs.watch(CACHE_FILE, (event: string, filename: string | null) => {
                    if (filename) {
                        if (fsWait) return;
                        fsWait = setTimeout(() => {
                            fsWait = null;
                            logger.info('SocketFoundryClient | Cache file changed, reloading...');
                            this.reloadCache();
                        }, 100);
                    }
                });
            }
        } catch (e) {
            logger.warn('SocketFoundryClient | Failed to load initial cache: ' + e);
        }
    }

    private async reloadCache() {
        try {
            const cache = await SetupScraper.loadCache();
            if (cache.worlds) {
                this.cachedWorlds = cache.worlds;
            } else {
                this.cachedWorlds = {};
            }

            // If we have an active world in memory, update its data too
            if (this.cachedWorldData && this.cachedWorldData.worldId) {
                const updated = this.cachedWorlds[this.cachedWorldData.worldId];
                if (updated) {
                    this.cachedWorldData = {
                        ...updated,
                        // Ensure optional fields are handled if missing in update
                        worldDescription: updated.worldDescription || null,
                        systemVersion: updated.systemVersion || updated.data?.version || '0.0.0'
                    };
                    logger.debug(`SocketFoundryClient | Hot-reloaded data for world: ${updated.worldTitle}`);
                }
            } else if (!this.cachedWorldData && cache.currentWorldId) {
                // Initialize from current world if available
                const current = this.cachedWorlds[cache.currentWorldId];
                if (current) {
                    this.cachedWorldData = {
                        ...current,
                        worldDescription: current.worldDescription || null,
                        systemVersion: current.systemVersion || current.data?.version || '0.0.0'
                    };
                    logger.debug(`SocketFoundryClient | Initialized from current world: ${current.worldTitle}`);
                }
            }
        } catch (e) {
            logger.error('SocketFoundryClient | Error reloading cache: ' + e);
        }
    }

    get status(): ServerConnectionStatus {
        // 1. Setup Mode - No active world
        if (this.worldState === 'setup') {
            return 'setup';
        }

        // 2. World Starting Up - Launch in progress (inferred from offline + recent launch activity)
        if (this.worldState === 'offline') {
            // Check if we're in a launch transition
            if (this.lastLaunchActivity > 0 && (Date.now() - this.lastLaunchActivity) < 60000) {
                return 'startup';
            }
            return 'disconnected';
        }

        // 3. Active World
        if (this.worldState === 'active') {
            // User requested strict "Setup" vs "Active" model.
            // Authentication is handled via the separate isLoggedIn boolean.
            return 'active';
        }

        // 4. Default - Disconnected
        return 'disconnected';
    }

    // ... (get url, resolveAdapter methods unchanged)

    // ... (login, logout methods - ensure they match existing)

    get url(): string {
        return this.config.url || '';
    }


    private async resolveAdapter(): Promise<SystemAdapter> {
        if (this.adapter) return this.adapter;
        const sys = await this.getSystem();
        const systemId = sys.id ? sys.id.toLowerCase() : 'generic';
        const adapter = getAdapter(systemId);

        if (!adapter) {
            throw new Error(`Critical Error: Could not resolve adapter for system '${systemId}'`);
        }

        this.adapter = adapter;
        return this.adapter;
    }

    async login(username?: string, password?: string): Promise<void> {
        if (username) this.config.username = username;
        if (password) this.config.password = password;

        this.isAuthenticating = true;
        this.isExplicitSession = true;

        try {
            // Clear existing session state to force re-auth in connect()
            this.sessionCookie = null;
            this.userId = null;

            if (this.isConnected) {
                this.disconnect('Login requested');
            }
            await this.connect();

            // wait for authenticated session AND active status
            const timeout = 30000;
            await this.waitForAuthentication(timeout);
        } catch (e: any) {
            logger.error(`SocketFoundryClient | Login exception: ${e.message}`);
            this.disconnect(`Login failure: ${e.message}`);
            throw e;
        } finally {
            this.isAuthenticating = false;
        }
    }

    /**
     * Resumes a connection using a previously saved session cookie.
     * Skips the POST /join authentication flow.
     */
    public async restoreSession(cookie: string, userId: string): Promise<void> {
        logger.info(`SocketFoundryClient | Restoring session for user ${userId}...`);
        this.sessionCookie = cookie;
        this.userId = userId;
        this.isExplicitSession = true;

        try {
            await this.connect();
            // We don't need to wait long here, connect() already handles basic verification
            logger.info(`SocketFoundryClient | Session restored successfully for user ${userId}.`);
        } catch (e: any) {
            logger.error(`SocketFoundryClient | Session restoration failed: ${e.message}`);
            this.resetState();
            throw e;
        }
    }

    /**
     * Validates that the current session is still valid on the server
     * and matches the expected world.
     */
    public async validateSession(expectedWorldId: string): Promise<boolean> {
        if (!this.isConnected || !this.userId) return false;

        try {
            // 1. Ensure we have world metadata. If missing (restored session), refresh it.
            if (!this.cachedWorldData?.worldId) {
                logger.info(`SocketFoundryClient | World metadata missing during validation. Refreshing...`);
                await this.reloadActiveWorldData();
            }

            const currentWorldId = this.cachedWorldData?.worldId;

            // 2. Verify world ID matches
            // We only fail if we HAVE a world ID and it doesn't match.
            // If it's STILL missing after refresh, we might be in an inconsistent state, but we'll be conservative.
            if (currentWorldId && currentWorldId !== expectedWorldId) {
                logger.warn(`SocketFoundryClient | Session validation failed: World ID mismatch (Expected: ${expectedWorldId}, Current: ${currentWorldId})`);
                return false;
            }

            // 3. Verify user is still authenticated (can fetch users)
            const users = await this.getUsers();
            const me = users.find((u: any) => (u._id || u.id) === this.userId);

            if (!me) {
                logger.warn(`SocketFoundryClient | Session validation failed: User ${this.userId} not found in world ${currentWorldId || expectedWorldId}.`);
                return false;
            }

            logger.info(`SocketFoundryClient | Session validated for user ${this.userId} in world ${currentWorldId || expectedWorldId}.`);
            return true;
        } catch (e) {
            logger.warn(`SocketFoundryClient | Session validation failed with error: ${e}`);
            return false;
        }
    }


    private async waitForAuthentication(timeoutMs: number): Promise<void> {
        logger.info(`SocketFoundryClient | Waiting for authentication (timeout: ${timeoutMs}ms)...`);
        const start = Date.now();
        // Optimistic: We only wait up to 5s for the active status. 
        // If we have the userId from the session event, we are effectively logged in.
        while (Date.now() - start < 5000) {
            if (this.userId) {
                let system, users;
                try {
                    // If the socket isn't connected, don't attempt to fetch raw data 
                    // to avoid spamming "Socket not connected" warnings in the logs.
                    if (this.isSocketConnected) {
                        system = await this.getSystem();
                        users = await this.getUsers();
                    } else {
                        // Fallback to cached system data if available 
                        system = await this.getSystem(); // This will use cached data if available
                        users = []; // No live users if socket is not connected
                    }
                    const me = users.find((u: any) => (u._id || u.id) === this.userId);
                    if (me?.active) {
                        logger.info(`SocketFoundryClient | User ${this.userId} is active.`);
                        return;
                    }
                } catch (e) {
                    // Suppress warnings for expected connection issues during this wait
                    if (!String(e).includes('Socket not connected')) {
                        logger.debug(`SocketFoundryClient | Error during authentication wait: ${e}`);
                    }
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        logger.info(`SocketFoundryClient | Proceeding with session (userId: ${this.userId})`);
    }


    /**
     * Aggressively reset all state to prevent stale data persistence.
     * Called on shutdown, disconnect (to setup), or invalid session detection.
     */
    private resetState() {
        const isUserSession = this.isExplicitSession;
        logger.info(`SocketFoundryClient | Resetting client state (User Session: ${isUserSession}, System Client: ${this.isSystemClient}).`);

        // Notify listener BEFORE we clear local state (in case they need userId)
        if (isUserSession && this.onSessionInvalidated) {
            this.onSessionInvalidated();
        }

        this.userMap.clear();
        this.worldCache.clear();
        this.actorCache.clear();
        this.cachedWorldData = null;
        this.worldTitleFromHtml = null;
        this.worldBackgroundFromHtml = null;

        // CRITICAL: Preserve System identity so it can resume watching
        if (!this.isSystemClient) {
            this.isExplicitSession = false;
            this.userId = null;
            this.discoveredUserId = null;
            this.sessionCookie = null;
        }

        this.consecutiveFailures = 0;
        this.validationFailCount = 0;
        this.isSocketConnected = false;

        // CRITICAL: ONLY stop the socket permanently if it's a User session.
        // System/Service Account clients must stay alive to see world launches.
        if (isUserSession && !this.isSystemClient && this.socket) {
            logger.info('SocketFoundryClient | Closing user socket permanently.');
            this.socket.close();
            this.socket = null;
        } else if (this.socket) {
            logger.info('SocketFoundryClient | Resetting socket caches (System Client). Maintaining connection manager.');
            // We don't close() so the reconnection manager stays active
        }

        if (this.worldState !== 'setup') {
            this.worldState = 'setup';
        }
    }

    async logout(): Promise<void> {
        logger.info(`SocketFoundryClient | Logging out user ${this.userId}`);
        this.isExplicitSession = false;
        this.userId = null;
        this.sessionCookie = null;
        this.disconnect("User logged out explicitly");
    }

    /**
     * Probe the socket for worldJoinData to discover the active world and users.
     * This is safer than scraping HTML or trusting cache.
     */
    private async getJoinData(socket: Socket): Promise<any> {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('getJoinData timeout')), 5000);
            socket.emit('getJoinData', (result: any) => {
                clearTimeout(t);
                resolve(result);
            });
        });
    }

    async connect(): Promise<void> {
        // Socket connection is now considered stable for v13.

        if (this.isConnected) return;

        // Load Multi-World Cache
        const cache = await SetupScraper.loadCache();
        if (cache && cache.worlds) {
            this.cachedWorlds = cache.worlds;
        }

        // Initialize Compendium Cache in background
        CompendiumCache.getInstance().initialize(this).catch(e => logger.warn(`CompendiumCache init failed: ${e}`));

        const currentUrl = this.config.url || '';
        const baseUrl = currentUrl.endsWith('/') ? currentUrl.slice(0, -1) : currentUrl;

        // 1. Authenticate if username provided
        // 1. Authenticate if username provided
        // 1. Authenticate if username provided AND we don't have a session cookie yet
        if (this.config.username && !this.sessionCookie) {
            logger.info(`SocketFoundryClient | Authenticating as ${this.config.username}...`);
            try {
                // A. Initial Request & CSRF Setup
                const cookieMap = new Map<string, string>();
                const addCookies = (header: string | null) => {
                    if (!header) return;
                    const cookies = header.split(/,(?=\s*[^;]+=[^;]+)/g);
                    cookies.forEach(c => {
                        const pair = c.split(';')[0].trim().split('=');
                        if (pair.length >= 2) cookieMap.set(pair[0].trim(), pair[1].trim());
                    });
                };

                const joinResponse = await fetch(`${baseUrl}/join`, {
                    headers: { 'User-Agent': 'SheetDelver/1.0' }
                });
                addCookies(joinResponse.headers.get('set-cookie'));
                const html = await joinResponse.text();

                // Check for Setup Mode (Redirect)
                const isSetup = joinResponse.url.includes('/setup') || html.includes('id="setup"');
                if (isSetup) {
                    logger.info('SocketFoundryClient | Detected Setup Mode via title/redirect.');
                    this.worldState = 'setup';
                    return; // Stop here if in setup
                }

                // Parse CSRF for later Login
                const csrfMatch = html.match(/name="csrf-token" content="(.*?)"/) || html.match(/"csrfToken":"(.*?)"/);
                const csrfToken = csrfMatch ? csrfMatch[1] : null;
                logger.info(`SocketFoundryClient | CSRF Token extracted: ${csrfToken ? 'Yes' : 'No'}`);

                // B. SOCKET DISCOVERY (Guest Probe)
                // Connect as guest first to identify world and users from the "Truth" (Socket API)
                logger.info('SocketFoundryClient | Connecting as Guest to probe world state...');

                // Construct guest cookie string
                const guestCookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
                logger.info(`SocketFoundryClient | Guest Cookie: ${guestCookie}`);

                // Temporary Guest Socket
                const guestSocket = io(baseUrl, {
                    path: '/socket.io',
                    transports: ['websocket'],
                    reconnection: false,
                    extraHeaders: { 'Cookie': guestCookie, 'User-Agent': 'SheetDelver/1.0' },
                    transportOptions: { websocket: { extraHeaders: { 'Cookie': guestCookie } } }
                });


                // B. WORLD DISCOVERY
                // We attempt to discover the world via Socket (preferred) or API (fallback).
                logger.info('SocketFoundryClient | Probing world state (Socket + API)...');

                let worldId: string | null = null;
                let worldTitle: string | null = null;
                let worldUsers: any[] = [];
                let systemId: string | null = null;
                let backgroundUrl: string | null = null;

                // 1. Socket Probe Logic
                const probeSocket = async (): Promise<boolean> => {
                    return new Promise<boolean>((resolve) => {
                        const t = setTimeout(() => {
                            guestSocket.disconnect();
                            resolve(false);
                        }, 3000); // Short timeout for socket probe

                        guestSocket.on('connect', () => {
                            // Wait for session then Emit
                            guestSocket.emit('getJoinData', (result: any) => {
                                clearTimeout(t);
                                if (result && result.world) {
                                    worldId = result.world.id;
                                    worldTitle = result.world.title;
                                    worldUsers = result.users || [];
                                    systemId = result.system?.id;
                                    backgroundUrl = result.world.background;
                                    this.activeModules = result.modules || [];
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                                guestSocket.disconnect();
                            });
                        });

                        guestSocket.on('connect_error', () => { clearTimeout(t); resolve(false); });
                    });
                };

                // 2. API Probe Logic (/api/status)
                const probeApi = async (): Promise<boolean> => {
                    try {
                        const statusRes = await fetch(`${baseUrl}/api/status`);
                        if (statusRes.ok) {
                            const status = await statusRes.json();
                            if (status.world) {
                                if (!worldId) worldId = status.world; // Use if socket didn't fill it
                                if (!systemId) systemId = status.system;
                                return true;
                            }
                        }
                    } catch (e) {
                        logger.warn(`SocketFoundryClient | API probe failed: ${e}`);
                    }
                    return false;
                };

                // Execute Probes in Parallel
                await Promise.all([probeSocket(), probeApi()]);

                if (!worldId) {
                    logger.warn('SocketFoundryClient | World Discovery Failed. Could not identify active world.');
                    throw new Error('World Discovery Failed - server returned no world data.');
                }

                logger.info(`SocketFoundryClient | Discovered World ID: "${worldId}" (Title: "${worldTitle || 'Unknown'}")`);

                // C. UPDATE CACHE / VALIDATE

                let users = worldUsers;
                const discoveryData = {
                    worldId,
                    worldTitle: worldTitle || worldId,
                    systemId: systemId || 'unknown',
                    backgroundUrl,
                    users,
                    lastUpdated: new Date().toISOString()
                };

                // Check Cache Logic (Multi-World)
                // We now lookup the specific cache entry for the discovered world ID
                // instead of relying on a single 'cachedWorldData' that might be stale.
                const cached = worldId ? this.cachedWorlds[worldId] : null;

                if (cached) {
                    logger.debug(`SocketFoundryClient | Active world matches cache entry (${worldId}). fusing data.`);
                    if (users.length === 0 && cached.users) {
                        users = cached.users; // Use cached users if socket was silent
                    }
                    if (!worldTitle && cached.worldTitle) {
                        logger.debug(`SocketFoundryClient | Using cached worldTitle: "${cached.worldTitle}"`);
                        worldTitle = cached.worldTitle;
                    }
                } else {
                    logger.debug(`SocketFoundryClient | No cache entry found for world "${worldId}".`);
                }

                this.cachedWorldData = {
                    ...discoveryData,
                    worldTitle: worldTitle || discoveryData.worldTitle,
                    worldDescription: (discoveryData as any).worldDescription || null,
                    backgroundUrl: cached?.backgroundUrl || discoveryData.backgroundUrl,
                    users: users
                };

                // Initialize User Map from Discovery Data
                // This ensures we have initial active status from getJoinData probe
                if (this.cachedWorldData.users) {
                    this.cachedWorldData.users.forEach((u: any) => {
                        const id = u._id || u.id;
                        this.userMap.set(id, u);
                    });
                    logger.debug(`SocketFoundryClient | Initialized userMap with ${this.userMap.size} users.`);
                }

                logger.debug(`SocketFoundryClient | cachedWorldData set with worldTitle: "${this.cachedWorldData.worldTitle}"`);

                // D. IDENTIFY USER
                let userId: string | null = null;

                // 1. Try Cache First (In-Memory)
                if (this.cachedWorldData && this.cachedWorldData.users) {
                    const cachedUser = this.cachedWorldData.users.find((u: any) => u.name === this.config.username);
                    if (cachedUser) {
                        userId = cachedUser._id || cachedUser.name; // In cache we store usually _id but could be legacy
                        logger.info(`SocketFoundryClient | Resolved User ID from memory cache: ${userId}`);
                    }
                }

                // 2. Try Discovery Data (Live)
                if (!userId) {
                    const targetUser = users.find((u: any) => u.name === this.config.username);
                    if (targetUser) {
                        userId = targetUser._id || (targetUser as any).id;
                    }
                }

                // 3. Fail if still missing
                if (!userId) {
                    throw new Error(`User "${this.config.username}" could not be identified via cache or discovery.`);
                }

                this.userId = userId;


                // E. EXPLICIT AUTHENTICATION (POST /join)
                let finalCsrf: string | null = csrfToken || null;

                // Check cookies for CSRF (V13 common pattern)
                if (!finalCsrf && this.cookieMap.has('csrf-token')) finalCsrf = this.cookieMap.get('csrf-token') || null;
                if (!finalCsrf && this.cookieMap.has('xsrf-token')) finalCsrf = this.cookieMap.get('xsrf-token') || null;

                if (!finalCsrf) logger.warn('SocketFoundryClient | No CSRF Token found. Login might fail.');

                if (finalCsrf === undefined) finalCsrf = null; // Ensure strict null type

                logger.info('SocketFoundryClient | Performing Explicit POST Login (JSON)...');

                // Use JSON body as per successful debug script
                const loginResponse = await fetch(`${baseUrl}/join`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': this.sessionCookie || '',
                        'User-Agent': 'SheetDelver/1.0'
                    },
                    body: JSON.stringify({
                        userid: userId,
                        password: this.config.password || '',
                        action: 'join',
                        'csrf-token': finalCsrf
                    }),
                    redirect: 'manual'
                });

                if (loginResponse.status !== 200 && loginResponse.status !== 302) {
                    const body = await loginResponse.text();
                    throw new Error(`Login failed with status ${loginResponse.status}: ${body.substring(0, 200)}`);
                }

                // Update Cookies from Login Response
                if (typeof (loginResponse.headers as any).getSetCookie === 'function') {
                    this.updateCookies((loginResponse.headers as any).getSetCookie());
                } else {
                    this.updateCookies(loginResponse.headers.get('set-cookie'));
                }

                logger.info(`SocketFoundryClient | Login Successful (Status: ${loginResponse.status}).`);

            } catch (e: any) {
                // If anything in the discovery/auth flow fails, we must NOT proceed to open the main socket.
                logger.error(`SocketFoundryClient | Handshake error: ${e.message}`);
                throw e;
            }
        }


        // 2. Fetch World Data (gameData) if we have a session AND we are the System Client
        // Optimization: User clients (Frontend via API) don't need this heavy fetch.
        if (this.isSystemClient && this.sessionCookie && !this.gameDataCache) {
            await this.fetchGameData();
        }

        // 3. Establish Socket Connection
        await new Promise<void>((resolve, reject) => {
            this.isJoining = false;

            // Robustly extract sessionId from cookie (look for 'session' or 'foundry')
            let sessionId: string | undefined;
            if (this.sessionCookie) {
                const parts = this.sessionCookie.split(';');
                for (const part of parts) {
                    const [key, value] = part.trim().split('=');
                    if (key === 'session' || key === 'foundry') {
                        sessionId = value;
                        logger.info(`SocketFoundryClient | Extracted sessionId from cookie: ${sessionId.substring(0, 8)}... (name: ${key})`);
                        break;
                    }
                }
                // Fallback to first if explicit search fails (legacy behavior)
                if (!sessionId && parts.length > 0) {
                    const [key, value] = parts[0].trim().split('=');
                    sessionId = value;
                    logger.info(`SocketFoundryClient | Fallback sessionId from first cookie: ${sessionId?.substring(0, 8)}... (name: ${key})`);
                }
            }

            const headers: { [key: string]: string } = {
                'Cookie': this.sessionCookie || '',
                'User-Agent': 'SheetDelver/1.0',
                'Origin': baseUrl || ''
            };

            logger.info(`SocketFoundryClient | Connecting to socket at ${baseUrl}...`);

            // @ts-ignore
            this.socket = io(baseUrl, {
                path: '/socket.io',
                transports: ['websocket'],
                reconnection: true,
                forceNew: true,
                query: (sessionId ? { session: sessionId } : {}) as any,
                auth: (sessionId ? { session: sessionId } : {}) as any,
                extraHeaders: headers,
                transportOptions: {
                    websocket: {
                        extraHeaders: headers
                    }
                },
                withCredentials: true
            });

            if (process.env.NODE_ENV !== 'production') {
                const ioOpts = (this.socket as any).io.opts;
                logger.debug(`SocketFoundryClient | Final socket options: path=${ioOpts.path}, query=${JSON.stringify(ioOpts.query)}`);
            }

            if (!this.socket) {
                return reject(new Error("Failed to initialize socket"));
            }

            const socket = this.socket;

            // Low-level diagnostics
            socket.on('connect', async () => {
                logger.info('SocketFoundryClient | Low-level Socket Connected. socket.id: ' + socket.id);
                // CRITICAL: We do NOT set isSocketConnected = true here. 
                // We wait for the 'session' event to confirm we have a valid environment.

                // Always verify system status on connection
                setTimeout(() => this.getSystem().catch(e => logger.warn('State refresh failed:', e)), 500);
            });

            socket.on('disconnect', (reason) => {
                logger.warn(`SocketFoundryClient | Socket disconnected (User: ${this.userId || 'none'}, System: ${this.isSystemClient}). Reason: ${reason}`);
                this.isSocketConnected = false;

                // If world state is changing or it's a hard server kick, clear state for users.
                if (this.isShuttingDown || reason === 'io server disconnect') {
                    // This is a definitive world shutdown or logout
                    if (this.worldState !== 'setup' || this.isShuttingDown) {
                        logger.info(`SocketFoundryClient | Definitive disconnect/shutdown: ${this.worldState} -> setup`);
                        this.worldState = 'setup';
                        this.resetState(); // Force state reset on definitive closure
                    }
                    this.isShuttingDown = false;
                } else if (this.worldState === 'active') {
                    // Transient disconnect: move to offline for status reporting, but keep setup mode disabled
                    logger.info('SocketFoundryClient | Transient disconnect. Moving to offline state.');
                    this.worldState = 'offline';
                    this.userMap.clear();
                    this.worldCache.clear();
                }
            });

            socket.io.on('reconnect_attempt', (attempt) => {
                logger.info('SocketFoundryClient | Reconnect attempt: ' + attempt);
            });

            socket.io.on('error', (error) => {
                logger.error('SocketFoundryClient | Socket.io error: ' + error);
            });

            // Handle when user is kicked/disconnected from Foundry
            socket.on('userDisconnected', (data: any) => {
                const id = typeof data === 'string' ? data : (data.userId || data._id || data.id);
                logger.warn(`SocketFoundryClient | User disconnected event received: ${id}`);

                const existing = this.userMap.get(id);
                if (existing) {
                    this.userMap.set(id, { ...existing, active: false });
                }

                if (id === this.userId) {
                    logger.warn('SocketFoundryClient | Current user was kicked/disconnected. Clearing session.');
                    this.isSocketConnected = false;
                    this.isExplicitSession = false; // Clear session flag
                    this.userId = null;
                    this.discoveredUserId = null;
                }
            });

            socket.on('userConnected', (user: any) => {
                const id = user._id || user.id;
                logger.info(`SocketFoundryClient | User connected: ${user.name} (${id})`);
                const existing = this.userMap.get(id) || {};
                this.userMap.set(id, { ...existing, ...user, active: true });
            });

            // Maintain User Map Verification (Create/Update/Delete)
            socket.on('createUser', (user: any) => {
                const id = user._id || user.id;
                logger.info(`SocketFoundryClient | User created: ${user.name} (${id})`);
                this.userMap.set(id, { ...user, active: false }); // Created but maybe not active yet?
            });

            socket.on('updateUser', (user: any) => {
                const id = user._id || user.id;
                // logger.debug(`SocketFoundryClient | User updated: ${id}`);
                const existing = this.userMap.get(id);
                if (existing) {
                    this.userMap.set(id, { ...existing, ...user });
                } else {
                    // Start tracking if we didn't have it
                    this.userMap.set(id, user);
                }
            });

            socket.on('deleteUser', (id: string | any) => {
                const userId = typeof id === 'string' ? id : (id._id || id.id);
                logger.info(`SocketFoundryClient | User deleted: ${userId}`);
                this.userMap.delete(userId);
            });

            // Activity-based status tracking (The real logout signal in V13)
            socket.on('userActivity', (userId: string, data: any) => {
                if (userId && data) {
                    // If active is explicitly false, they are logging out.
                    // Otherwise, any activity implies they are active.
                    const isActiveSignal = data.active !== false;

                    const existing = this.userMap.get(userId);
                    if (existing) {
                        if (existing.active !== isActiveSignal) {
                            logger.info(`SocketFoundryClient | User status change via activity: ${existing.name} (${userId}) -> ${isActiveSignal}`);
                            this.userMap.set(userId, { ...existing, active: isActiveSignal });
                        }
                    } else if (isActiveSignal) {
                        // Discovered an active user we didn't know about (missed join event?)
                        // Trigger a background sync to get their details.
                        logger.debug(`SocketFoundryClient | Discovered unknown active user via activity: ${userId}. Syncing...`);
                        this.getUsers(false).then(users => {
                            const user = users.find((u: any) => (u._id === userId || u.id === userId));
                            if (user) {
                                this.userMap.set(userId, { ...user, active: true });
                                logger.info(`SocketFoundryClient | Self-healed user from activity: ${user.name}`);
                            }
                        }).catch(() => { });
                    }
                }
            });

            // Robust Fallback: Listen for User updates via modifyDocument or similar
            // Foundry sends "modifyDocument" for document updates.
            socket.on('modifyDocument', (data: any) => {
                // If the updated document is a User, update our map
                // data payload: { type: "User", action: "update", result: [ { _id: "...", active: false, ... } ], ... }
                if (data.type === 'User' && (data.action === 'update' || data.action === 'create')) {
                    const users = data.result || [];
                    users.forEach((u: any) => {
                        const id = u._id || u.id;
                        if (id) {
                            const existing = this.userMap.get(id);
                            // If 'active' is present in the update, use it. Otherwise use existing.
                            const isActive = (u.active !== undefined) ? u.active : (existing?.active || false);

                            if (existing) {
                                this.userMap.set(id, { ...existing, ...u, active: isActive });
                                logger.info(`SocketFoundryClient | User document updated: ${u.name || existing.name} (${id}) | Active: ${isActive}`);
                            } else {
                                this.userMap.set(id, { ...u, active: isActive });
                                logger.info(`SocketFoundryClient | User document created/tracked: ${u.name} (${id}) | Active: ${isActive}`);
                            }
                        }
                    });
                }
            });

            // Shared Content Handling
            socket.on('shareImage', (data: any) => {
                logger.info(`SocketFoundryClient | Received shared image: ${data.image}`);
                this.sharedContent = {
                    type: 'image',
                    data: {
                        url: data.image,
                        title: data.title
                    },
                    timestamp: Date.now()
                };
            });

            socket.on('showEntry', (uuid: string, ...args: any[]) => {
                logger.info(`SocketFoundryClient | Received shared entry: ${uuid}`);
                // Parse UUID: "JournalEntry.ID"
                const parts = uuid.split('.');
                if (parts.length >= 2 && parts[0] === 'JournalEntry') {
                    const id = parts[1];
                    this.sharedContent = {
                        type: 'journal',
                        data: {
                            id: id,
                            uuid: uuid
                        },
                        timestamp: Date.now()
                    };
                }
            });

            socket.onAny((event, ...args) => {
                if (process.env.NODE_ENV !== 'production' && !this.isConnected) {
                    // Log during connection phase, then quiet down
                    if (event !== 'userActivity') {
                        logger.debug(`>>> SOCKET EVENT: ${event} | ${JSON.stringify(args).substring(0, 200)}`);
                    }
                }



                if (event === 'session') {
                    const data = args[0] || {};
                    if (data.userId) {
                        logger.info(`SocketFoundryClient | Session event. Authenticated as ${data.userId}`);
                        this.discoveredUserId = data.userId;
                        this.userId = data.userId;

                        // Fetch full world metadata via socket if we don't have it (e.g. restoration)
                        if (!this.cachedWorldData?.worldId) {
                            logger.info(`SocketFoundryClient | Fetching world metadata via socket...`);
                            socket.emit('getJoinData', (result: any) => {
                                if (result?.world) {
                                    const systemId = result.system?.id || result.system?.name || 'unknown';
                                    const systemVersion = result.system?.version || '0.0.0';
                                    this.cachedWorldData = {
                                        worldId: result.world.id,
                                        worldTitle: result.world.title,
                                        worldDescription: result.world.description || null,
                                        systemId: systemId.toLowerCase(),
                                        systemVersion: systemVersion,
                                        backgroundUrl: result.world.background,
                                        users: result.users || [],
                                        lastUpdated: new Date().toISOString(),
                                        data: result.world
                                    };
                                    logger.info(`SocketFoundryClient | Metadata restored: "${result.world.title}" (System: ${systemId} v${systemVersion})`);
                                } else {
                                    logger.warn(`SocketFoundryClient | getJoinData returned no world data. Structure: ${Object.keys(result || {}).join(', ')}`);
                                }
                                resolve();
                            });
                            return; // Wait for the callback to resolve
                        }
                    } else {
                        logger.info(`SocketFoundryClient | Session event. Guest session (userId: null).`);

                        // IF we previously thought we were an authenticated user session,
                        // and we just became a guest, the world likely restarted or the cookie expired.
                        if (this.isExplicitSession) {
                            logger.warn('SocketFoundryClient | User session downgraded to guest. Triggering reset.');
                            this.resetState();
                            return; // resetState clears socket
                        }

                        this.userId = null;
                        this.isSocketConnected = true; // Guest connection is still a "Connection"
                    }

                    this.isSocketConnected = true;
                    logger.info(`SocketFoundryClient | Session established. isSocketConnected = true.`);

                    // DEBUG: Inspect session payload
                    const payload = args[0] || {};
                    const sessionActive = payload.activeUsers || payload.userIds || [];
                    logger.info(`SocketFoundryClient | Session active users: ${JSON.stringify(sessionActive)}`);
                    logger.info(`SocketFoundryClient | Session Payload keys: ${Object.keys(payload).join(', ')}`);
                    if (payload.users) {
                        logger.info(`SocketFoundryClient | Session payload has ${payload.users.length} users.`);
                    }

                    // Fetch World State via getJoinData (Standard handshake)
                    this.socket?.emit('getJoinData', (response: any) => {
                        if (response.users) {
                            // First populate users
                            this.userMap.clear(); // Clear existing map before repopulating
                            response.users.forEach((u: any) => {
                                const id = u._id || u.id;
                                const existing = this.userMap.get(id) || {};
                                // Default active to false initially
                                this.userMap.set(id, { ...existing, ...u, active: false });
                            });
                        }

                        if (response.activeUsers) {
                            response.activeUsers.forEach((activeId: string) => {
                                const existing = this.userMap.get(activeId);
                                if (existing) {
                                    this.userMap.set(activeId, { ...existing, active: true });
                                } else {
                                    // If user not in 'users' list but in 'activeUsers' (rare), create entry
                                    this.userMap.set(activeId, { id: activeId, active: true });
                                }
                            });
                        }
                    });

                    this.isJoining = false;
                    resolve();
                }

                // Detect userActivity for self and others
                if (event === 'userActivity') {
                    const arg1 = args[0];
                    const activeUserId = typeof arg1 === 'string' ? arg1 : (arg1?.userId || arg1?._id || arg1?.id);

                    if (activeUserId) {
                        const existing = this.userMap.get(activeUserId);
                        if (existing) {
                            this.userMap.set(activeUserId, { ...existing, active: true });
                        }

                        if (activeUserId === this.discoveredUserId && !this.isConnected) {
                            logger.info(`SocketFoundryClient | Detected userActivity for self (${activeUserId}). Assuming connected.`);
                            this.isSocketConnected = true;
                            resolve();
                        }
                    }
                }

                // World Launch Progress (e.g. from Setup to Game)
                if (event === 'progress') {
                    const data = args[0] || {};
                    // DEBUG: Dump full progress event data
                    logger.info(`SocketFoundryClient | [DEBUG] progress event data: ${JSON.stringify(data)}`);

                    // If we see launchWorld progress, we are definitely moving out of setup.
                    if (data.action === 'launchWorld') {
                        if (this.isSetupMode || this.worldState === 'offline') {
                            logger.info(`SocketFoundryClient | World launch detected (${data.pct}%). Transitioning state.`);
                            this.worldState = 'active'; // Move out of setup/offline
                        }

                        // When world launch completes, the world is ready!
                        // We don't always get a ready/init event if we're already connected
                        if (data.step === 'complete' && data.pct === 100) {
                            logger.info(`SocketFoundryClient | World launch complete. World is now ready.`);

                            // Definitive transition to active
                            this.worldState = 'active';
                            this.lastLaunchActivity = 0; // Clear startup flags

                            // Extract world ID from progress event and reload cached world data
                            const worldId = data.id;
                            if (worldId) {
                                logger.info(`SocketFoundryClient | World launched: ${worldId}`);
                                const cached = this.cachedWorlds[worldId];
                                if (cached) {
                                    this.cachedWorldData = {
                                        worldId: cached.worldId,
                                        worldTitle: cached.worldTitle,
                                        worldDescription: cached.worldDescription || null,
                                        systemId: cached.systemId,
                                        backgroundUrl: cached.backgroundUrl,
                                        users: cached.users || [],
                                        lastUpdated: cached.lastUpdated,
                                        data: cached.data
                                    };
                                    logger.info(`SocketFoundryClient | Loaded cached world data: "${cached.worldTitle}"`);
                                } else {
                                    logger.warn(`SocketFoundryClient | No cached data found for world: ${worldId}`);
                                }
                            }

                            // Immediately fetch system data to populate cache and confirm connection details
                            setTimeout(() => {
                                this.getSystem().catch(err => {
                                    logger.warn(`SocketFoundryClient | Post-launch system fetch failed: ${err.message}`);
                                });
                            }, 500);
                        }
                    }
                }


                if (event === 'ready' || event === 'init') {
                    const payload = args[0] || {};
                    // DEBUG: Dump full ready/init event payload
                    logger.info(`SocketFoundryClient | [DEBUG] ${event} event payload: ${JSON.stringify(payload, null, 2)}`);

                    // World is ready, so setup mode is definitely over.
                    this.worldState = 'active';
                    this.lastLaunchActivity = 0; // Clear startup mode

                    // Extract world ID from payload and reload cached world data
                    const worldId = payload.world || payload.worldId;
                    if (worldId) {
                        logger.info(`SocketFoundryClient | '${event}' event - World ID: ${worldId}`);
                        const cached = this.cachedWorlds[worldId];
                        if (cached) {
                            this.cachedWorldData = {
                                worldId: cached.worldId,
                                worldTitle: cached.worldTitle,
                                worldDescription: cached.worldDescription || null,
                                systemId: cached.systemId,
                                backgroundUrl: cached.backgroundUrl,
                                users: cached.users || [],
                                lastUpdated: cached.lastUpdated
                            };
                            logger.info(`SocketFoundryClient | Loaded cached world data from ${event} event: "${cached.worldTitle}"`);
                        }
                    } else {
                        logger.info(`SocketFoundryClient | '${event}' payload keys: ${Object.keys(payload).join(', ')}`);
                    }

                    const activeUserIds = payload.activeUsers || payload.userIds || [];
                    logger.info(`SocketFoundryClient | Active users count: ${activeUserIds.length}`);
                    logger.info(`SocketFoundryClient | Active User IDs: ${JSON.stringify(activeUserIds)}`);
                    logger.info(`SocketFoundryClient | Payload keys: ${Object.keys(payload).join(', ')}`);
                    if (payload.users) {
                        logger.info(`SocketFoundryClient | Populating user map with ${payload.users.length} users from ready event.`);
                        this.userMap.clear(); // Clear existing map before repopulating
                        payload.users.forEach((u: any, i: number) => {
                            const id = u._id || u.id;
                            const isActive = activeUserIds.includes(id) || u.active === true;
                            if (i < 3) logger.info(`SocketFoundryClient | User ${u.name} (${id}) | active: ${isActive} (doc active: ${u.active})`);
                            this.userMap.set(id, { ...u, active: isActive });
                        });
                    }

                    this.isSocketConnected = true;
                    this.isJoining = false;

                    // F. POST-CONNECT SYNC (Users)
                    // Fetch full user details from DB to enrich the real-time userMap (which has active status)
                    this.getUsers().then(dbUsers => {
                        dbUsers.forEach((u: any) => {
                            const id = u._id || u.id;
                            const existing = this.userMap.get(id);
                            // Merge DB data (u) with existing active status
                            const isActive = existing?.active || false;
                            this.userMap.set(id, { ...u, active: isActive });
                        });
                        logger.info(`SocketFoundryClient | Synced ${dbUsers.length} users from DB.`);
                    }).catch(e => {
                        logger.warn(`SocketFoundryClient | Failed to sync users from DB: ${e.message}`);
                    });


                }

                // World Shutdown Detection
                if (event === 'shutdown') {
                    const data = args[0] || {};
                    logger.info(`SocketFoundryClient | World shutdown event: ${data.world || 'unknown'}`);
                    this.worldState = 'setup';
                    this.lastLaunchActivity = 0;
                    this.resetState();
                }

                if (event === 'setup') {
                    logger.error(`SocketFoundryClient | Received 'setup' event. Aborting.`);
                    this.socket?.disconnect();
                    reject(new Error("Connected to setup instead of game world."));
                }

            });

            socket.on('userActivity', (arg1: any) => {
                // arg1 might be userId (string) or activity data (object)
                const activeUserId = typeof arg1 === 'string' ? arg1 : arg1?.userId;

                if (activeUserId === this.discoveredUserId && this.isJoining) {
                    logger.info(`SocketFoundryClient | Detected userActivity for self (${activeUserId}). Assuming connected.`);
                    this.isSocketConnected = true;
                    this.isJoining = false;
                    resolve();
                }
            });

            socket.on('connect_error', (error: any) => {
                this.isSocketConnected = false;
                logger.error('SocketFoundryClient | Connection error:', error);
                reject(error);
            });

            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error("Timeout waiting for Foundry session/authentication. Ensure world is active and user is not already blocked by a ghost session."));
                }
            }, 60000); // 60s for slower environments
        });

        // 3. Post-Connection Initialization
        try {
            const adapter = await this.resolveAdapter();
            if (adapter.loadSupplementaryData) {
                logger.debug('SocketFoundryClient | Loading supplementary system data...');
                // Ensure cache is initialized if it wasn't already (though it should be)
                if (!CompendiumCache.getInstance().hasLoaded()) {
                    await CompendiumCache.getInstance().initialize(this);
                }
                await adapter.loadSupplementaryData(CompendiumCache.getInstance());
                logger.info('SocketFoundryClient | Supplementary data loaded successfully.');
            }
        } catch (e) {
            logger.warn(`SocketFoundryClient | Failed to load supplementary data: ${e}`);
        }
    }

    public disconnect(reason?: string) {
        if (reason) this.disconnectReason = reason;
        if (this.socket) {
            this.socket.disconnect();
        }
        this.socket = null;
        this.isSocketConnected = false;

        // If we didn't explicitly request a shutdown, and we aren't already in setup,
        // then we are truly offline.
        if (!this.isShuttingDown && this.worldState !== 'setup') {
            this.worldState = 'offline';
        }
        // CRITICAL: We DO NOT clear isExplicitSession or userId here anymore.
        // This allows the session to persist through transient socket reconnections.

        this.isJoining = false;
        if (!this.isAuthenticating) {
            this.isAuthenticating = false;
        }
        this.consecutiveFailures = 0;
        this.validationFailCount = 0;
        logger.info(`SocketFoundryClient | Socket Disconnected. Reason: ${this.disconnectReason || 'None'}`);
    }

    /**
     * Reload active world data from cachedWorlds.
     * This is called after a world launch to repopulate cachedWorldData.
     */
    private async reloadActiveWorldData(): Promise<void> {
        try {
            // Fetch the /game page to extract the world ID
            const gamePageRes = await fetch(`${this.url}/game`, {
                headers: { Cookie: this.sessionCookie || '' }
            });

            if (!gamePageRes.ok) {
                logger.warn(`SocketFoundryClient | Failed to fetch /game page: ${gamePageRes.status}`);
                return;
            }

            const html = await gamePageRes.text();

            // Extract world ID from the page (it's usually in a data attribute or script)
            // Try multiple patterns to find the world ID
            let worldId: string | null = null;

            // Pattern 1: data-world attribute
            const dataWorldMatch = html.match(/data-world="([^"]+)"/);
            if (dataWorldMatch) {
                worldId = dataWorldMatch[1];
            }

            // Pattern 2: world: {id: "..."} in script
            if (!worldId) {
                const scriptWorldMatch = html.match(/world:\s*\{\s*id:\s*"([^"]+)"/);
                if (scriptWorldMatch) {
                    worldId = scriptWorldMatch[1];
                }
            }

            if (!worldId) {
                logger.warn(`SocketFoundryClient | Could not extract world ID from /game page`);
                return;
            }

            logger.info(`SocketFoundryClient | Detected active world ID: ${worldId}`);

            // Load from cachedWorlds if available
            const cached = this.cachedWorlds[worldId];
            if (cached) {
                this.cachedWorldData = {
                    worldId: cached.worldId,
                    worldTitle: cached.worldTitle,
                    worldDescription: cached.worldDescription || null,
                    systemId: cached.systemId,
                    systemVersion: cached.systemVersion || cached.data?.version || '0.0.0',
                    backgroundUrl: cached.backgroundUrl,
                    users: cached.users || [],
                    lastUpdated: cached.lastUpdated,
                    data: cached.data
                };
                logger.info(`SocketFoundryClient | Loaded cached world data: "${cached.worldTitle}"`);
            } else {
                logger.warn(`SocketFoundryClient | No cached data found for world: ${worldId}`);
            }
        } catch (error: any) {
            logger.warn(`SocketFoundryClient | Failed to reload world data: ${error.message}`);
        }
    }

    private async emit<T>(event: string, payload: any, timeoutMs: number = 5000): Promise<T> {
        if (!this.socket || !this.isConnected) {
            throw new Error(`Not connected to Foundry (event: ${event})`);
        }

        const socket = this.socket;
        const requestId = Math.random().toString(36).substring(7);

        return new Promise((resolve, reject) => {
            if (process.env.NODE_ENV !== 'production') {
                logger.debug(`SocketFoundryClient | EMIT [${requestId}]: ${event}`, JSON.stringify(payload));
            }

            socket.emit(event, payload, (response: any) => {
                if (process.env.NODE_ENV !== 'production') {
                    const responseStr = JSON.stringify(response);
                    logger.debug(`SocketFoundryClient | RESPONSE [${requestId}]: ${event}`, responseStr.length > 500 ? responseStr.substring(0, 500) + "..." : responseStr);
                }

                if (response?.error) {
                    const errorMessage = typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
                    reject(new Error(errorMessage));
                } else {
                    resolve(response);
                }
            });

            setTimeout(() => reject(new Error(`Timeout waiting for event: ${event} [${requestId}]`)), timeoutMs);
        });
    }

    /**
     * Dispatches a document socket request using the Foundry v13 protocol.
     * @param type The document type (e.g., "Actor", "Item")
     * @param action The action (get, create, update, delete)
     * @param operation The operation parameters
     * @param parent Specific parent context (optional)
     */
    private async dispatchDocumentSocket(type: string, action: string, operation: any = {}, parent?: { type: string, id: string }, failHard: boolean = true, timeoutMs: number = 5000): Promise<any> {
        if (!this.socket?.connected) {
            logger.warn(`SocketFoundryClient | Attempting to dispatch ${type}.${action} while disconnected.`);
            throw new Error('Socket not connected');
        }

        // Ensure action is set in operation
        operation.action = action;

        // Handle parent logic: convert {type, id} to parentUuid string
        if (parent) {
            // Mapping simplistic type/id to UUID
            operation.parentUuid = `${parent.type}.${parent.id}`;
        }
        else if (operation.parent && typeof operation.parent === 'object') {
            operation.parentUuid = `${operation.parent.type}.${operation.parent.id}`;
            delete operation.parent;
        }

        const payload = {
            type,
            action,
            operation
        };

        try {
            const result = await this.emit('modifyDocument', payload, timeoutMs);
            this.consecutiveFailures = 0; // Reset on success
            return result;
        } catch (error: any) {
            // Check if we are in the "launch transition window"
            // During World Launch, socket requests (modifyDocument/getSystem) often timeout for 30-60s
            // We should NOT count these as connection failures to avoid a disconnect loop.
            const isLaunchTransition = (Date.now() - this.lastLaunchActivity) < 60000;

            if (failHard) {
                if (isLaunchTransition && error.message?.includes('Timeout')) {
                    logger.debug(`SocketFoundryClient | Timeout during launch transition. Ignoring failure count.`);
                } else {
                    this.consecutiveFailures++;
                }

                if (this.consecutiveFailures >= 15) {
                    logger.error(`SocketFoundryClient | Too many consecutive failures (${this.consecutiveFailures}) in dispatch. Forcing disconnect.`);
                    this.disconnect('Too many consecutive failures: ' + this.consecutiveFailures);
                }
            } else {
                // If failHard is false, we don't count failures, but we generally assume success/retry logic elsewhere
                this.consecutiveFailures = 0;
            }
            throw error;
        }
    }

    async switchPage<T>(): Promise<T> {
        logger.warn(`SocketFoundryClient | switchPage() not supported.`);
        return null as any;
    }

    async evaluate<T>(): Promise<T> {
        logger.warn(`SocketFoundryClient | evaluate() not supported.`);
        return null as any;
    }

    async getSystem(): Promise<SystemInfo> {
        // 1. Primary State Check
        if (this.isAuthenticating) {
            return {
                id: 'unknown',
                title: 'Authenticating...',
                version: '0.0.0',
                isLoggedIn: this.isLoggedIn,
                status: this.status,
                worldDescription: this.cachedWorldData?.worldDescription || this.cachedWorldData?.data?.description || null
            };
        }

        // 2. Connection Check
        // If socket is disconnected, we report it.
        if (!this.isSocketConnected) {
            const cached: any = this.cachedWorldData || {};
            const sid = (cached.systemId || 'unknown').toLowerCase();

            // Convert relative background URL to absolute
            let bgUrl = cached.backgroundUrl || cached.worldBackground;
            if (bgUrl && !bgUrl.startsWith('http://') && !bgUrl.startsWith('https://')) {
                const baseUrl = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
                const cleanPath = bgUrl.startsWith('/') ? bgUrl : `/${bgUrl}`;
                bgUrl = `${baseUrl}${cleanPath}`;
            }

            return {
                id: sid,
                title: sid !== 'unknown' ? (sid.charAt(0).toUpperCase() + sid.slice(1)) : 'Reconnecting...',
                version: (cached.data as any)?.version || cached.systemVersion || '0.0.0',
                worldTitle: cached.worldTitle || 'Reconnecting...',
                worldBackground: bgUrl,
                isLoggedIn: this.isLoggedIn,
                status: this.status,
                worldDescription: cached.worldDescription || cached.data?.description || null
            };
        };

        // 3. Setup Mode Check
        // If we're in setup mode, don't attempt to fetch documents (they don't exist)
        // Return cached data from the last active world or setup page scraping
        if (this.worldState === 'setup') {
            const cached: any = this.cachedWorldData || {};

            // Convert relative background URL to absolute
            let bgUrl = cached.backgroundUrl || `${this.url}/ui/denim075.png`;
            if (bgUrl && !bgUrl.startsWith('http://') && !bgUrl.startsWith('https://')) {
                const baseUrl = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
                const cleanPath = bgUrl.startsWith('/') ? bgUrl : `/${bgUrl}`;
                bgUrl = `${baseUrl}${cleanPath}`;
            }

            return {
                id: cached.systemId || 'unknown',
                title: cached.systemId ? (cached.systemId.charAt(0).toUpperCase() + cached.systemId.slice(1)) : 'Setup Mode',
                version: (cached.data as any)?.version || '0.0.0',
                worldTitle: cached.worldTitle || 'No World Active',
                worldBackground: bgUrl,
                isLoggedIn: this.isLoggedIn,
                status: 'setup',
                worldDescription: cached.worldDescription || cached.data?.description || null
            };
        }

        const cached = this.worldCache.get(this.url) || {};
        const scraperCache = this.cachedWorldData;

        // Preference order: cachedWorldData.systemId -> cachedWorldData.data.system -> local cache id -> generic
        const rawSid = scraperCache?.systemId || (scraperCache?.data as any)?.system || cached.id || 'generic';
        const sid = rawSid.toLowerCase();

        // Helper to convert relative background URLs to absolute
        const getAbsoluteBackgroundUrl = (bgUrl: string | null | undefined): string => {
            if (!bgUrl) return `${this.url}/ui/denim075.png`;
            if (bgUrl.startsWith('http://') || bgUrl.startsWith('https://')) return bgUrl;
            // Relative path - prepend Foundry URL
            const baseUrl = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
            const cleanPath = bgUrl.startsWith('/') ? bgUrl : `/${bgUrl}`;
            return `${baseUrl}${cleanPath}`;
        };

        const sysData: SystemInfo = {
            id: sid,
            title: cached.title || (sid !== 'generic' && sid !== 'unknown' ? sid.charAt(0).toUpperCase() + sid.slice(1) : 'Unknown System'),
            version: (scraperCache?.data as any)?.version || scraperCache?.systemVersion || cached.version || '1.0.0',
            worldTitle: scraperCache?.worldTitle || this.worldTitleFromHtml || cached.title || this.url,
            worldDescription: scraperCache?.worldDescription || scraperCache?.data?.description || null,
            worldBackground: getAbsoluteBackgroundUrl(scraperCache?.backgroundUrl || this.worldBackgroundFromHtml),
            isLoggedIn: this.isLoggedIn,
            users: { active: 0, total: 0 },
            status: this.status
        };

        try {
            // 3. Fetch System Data (if ready/active)
            const socketTimeout = 5000;

            // If worldState is active, we expect this to work.
            // If worldState is unknown (offline->connected transition), we attempt it.

            // Skip modifyDocument for guest sessions if we already know world is ready
            // Return cached data immediately to ensure login screen shows world info
            if (!this.userId && this.worldState === 'active' && scraperCache?.worldTitle) {
                logger.debug(`SocketFoundryClient | Returning cached world data for guest session (world active).`);
                return sysData;
            } else {
                const sysResponse: any = await this.dispatchDocumentSocket('Setting', 'get', {
                    query: { key: 'core.system' },
                    broadcast: false
                }, undefined, false, socketTimeout);

                if (process.env.NODE_ENV !== 'production') {
                    logger.debug(`SocketFoundryClient | getSystem response: ${JSON.stringify(sysResponse).substring(0, 200)}`);
                }

                if (sysResponse?.result?.[0]?.value) {
                    sysData.id = sysResponse.result[0].value;

                    // Update title if it's still the default but we have a different system ID
                    if (sysData.id !== 'generic' && sysData.title === 'Unknown System') {
                        // Simple capitalization (e.g. morkborg -> Morkborg)
                        sysData.title = sysData.id.charAt(0).toUpperCase() + sysData.id.slice(1);
                    }

                    this.worldCache.set(this.url, { ...this.worldCache.get(this.url), id: sysData.id, title: sysData.title });

                    // Confirmation of system data means world is definitely active
                    if (this.worldState !== 'active') {
                        logger.info(`SocketFoundryClient | Socket responsiveness confirmed world is active.`);
                        this.worldState = 'active';
                        this.lastLaunchActivity = 0;
                    }
                }
            }

            // 4. Fetch Users
            let users: any[] = [];


            // STRATEGY: Guests rely on CACHE. Auth users try LIVE.
            if (this.userId) {
                try {
                    users = Array.from(this.userMap.values());
                    if (users.length === 0) {
                        users = await this.getUsers(false).catch(() => []);
                    }
                } catch (e: any) {
                    logger.warn(`SocketFoundryClient | Live user fetch failed: ${e.message}`);
                }
            }

            if (users.length === 0) {
                // 1. Memory Cache
                if (this.cachedWorldData?.users && this.cachedWorldData.users.length > 0) {
                    users = this.cachedWorldData.users;
                }
                // 2. Disk Cache (Dynamic Reload - Throttled)
                // REMOVED: Do not blindly load 'currentWorldId' from disk.
                // We must rely on connect() verification to populate cachedWorldData.
                else if (Date.now() - this.lastCacheReload > 5000) {
                    // no-op - logic removed to prevent stale world data
                }
            }

            if (users && users.length > 0) {
                // Confirmation of users means world is definitely active
                if (this.worldState !== 'active') {
                    logger.info(`SocketFoundryClient | Found ${users.length} users. World is active.`);
                    this.worldState = 'active';
                    this.lastLaunchActivity = 0;
                }

                const activeUsers = users.filter((u: any) => {
                    const id = u._id || u.id;
                    return id === this.userId || u.active === true;
                });

                // Session Validation
                if (this.isExplicitSession && this.userId) {
                    const me = users.find((u: any) => (u._id || u.id) === this.userId);
                    if (!me || me.active === false) {
                        this.validationFailCount++;
                        if (this.validationFailCount >= 10) {
                            logger.warn(`SocketFoundryClient | User session invalidated (inactive/kicked). Clearing session state.`);
                            // Soft reset instead of hard disconnect
                            logger.info(`SocketFoundryClient | user session invalidated, but socket remains connected.`);
                            this.isExplicitSession = false;
                            this.userId = null;
                            this.discoveredUserId = null;
                            this.sessionCookie = null;
                            sysData.isLoggedIn = false;
                            this.validationFailCount = 0;
                        }
                    } else {
                        this.validationFailCount = 0;
                    }
                } else {
                    this.validationFailCount = 0;
                }

                sysData.status = this.status;

                return {
                    ...sysData,
                    status: this.status, // Ensure final status
                    users: {
                        active: activeUsers.length,
                        total: users.length,
                        list: users
                    }
                };
            }

            // Sync status before basic return
            sysData.status = this.status;
            return sysData;

        } catch (e: any) {
            // 5. Timeout / Failure Handling
            // If we time out on a guest session, it's a strong indicator of Setup Mode
            // because the Setup page does not respond to socket requests like 'Setting'.
            // CRITICAL: If we are logged in (isLoggedIn), we NEVER infer setup mode.
            if (e.message && e.message.includes('Timeout') && !this.userId && !this.isLoggedIn) {
                // CRITICAL FIX: If we already know the world is active, DO NOT demote to setup on a timeout.
                // CRITICAL FIX: If we already know the world is active, DO NOT demote to setup on a timeout.
                // ALSO: Do not infer setup mode just from a timeout. This causes regressions during login/load.
                // We rely on connect() scraping and 'shutdown' events for Setup detection.
                logger.warn('SocketFoundryClient | Timeout on guest session. Ignoring Setup inference to prevent regression.');
                return sysData;
            }
            logger.warn(`SocketFoundryClient | Failed to fetch system info: ${e}`);
            return sysData;
        }
    }


    async getUsers(failHard: boolean = true): Promise<any[]> {
        const response: any = await this.dispatchDocumentSocket('User', 'get', { broadcast: false }, undefined, failHard);
        return response?.result || [];
    }

    async getUsersDetails(): Promise<any[]> {
        if (!this.isSocketConnected) {
            return []; // No logs for expected disconnection
        }
        let users = Array.from(this.userMap.values());
        if (users.length === 0) users = await this.getUsers().catch(() => []);

        // Try to update actor cache for names if empty or periodically
        if (this.actorCache.size === 0 || Math.random() < 0.05) {
            try {
                const actors = await this.getActors();
                actors.forEach((a: any) => {
                    this.actorCache.set(a._id || a.id, a.name);
                });
            } catch { }
        }

        return users.map(u => {
            const id = u._id || u.id;
            // A user is active ONLY if:
            // 1. It is our own client instance's user AND we are connected
            // 2. Foundry explicitly reports them as active in the user document
            const isActive = (id === this.userId && this.isConnected) || u.active === true;

            return {
                id,
                name: u.name,
                isGM: (u.role || 0) >= 3, // Role 3 is Assistant GM, Role 4 is GM
                active: isActive,
                color: u.color || '#ffffff',
                characterName: u.character ? this.actorCache.get(u.character) : undefined
            };
        });
    }

    getCurrentUserId(): string | null {
        return this.userId || this.discoveredUserId || null;
    }

    async getSystemData(): Promise<any> {
        const adapter = await this.resolveAdapter();
        return await adapter.getSystemData(this);
    }

    async getActors(): Promise<any[]> {
        // Ensure cache is loaded before fetching to allow resolving names
        try {
            await Promise.race([
                CompendiumCache.getInstance().initialize(this),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch { }

        try {
            // operation: { action: 'get', broadcast: false }
            // Response: { result: Object[] } -> we return result
            const response = await this.dispatchDocumentSocket('Actor', 'get', { broadcast: false });
            return response?.result || [];
        } catch (e: any) {
            logger.warn(`getActors failed: ${e.message}`);
            return [];
        }
    }

    async getJournals(): Promise<any[]> {
        try {
            const response = await this.dispatchDocumentSocket('JournalEntry', 'get', { broadcast: false });
            return response?.result || [];
        } catch (e: any) {
            logger.warn(`getJournals failed: ${e.message}`);
            return [];
        }
    }

    async getActor(id: string, forceSystemId?: string): Promise<any> {
        const adapter = forceSystemId ? getAdapter(forceSystemId) : await this.resolveAdapter();
        if (!adapter) throw new Error("Could not resolve adapter");

        // v13 doesn't have a distinct 'getDocument'. We use 'get' with a query for _id.
        const response: any = await this.dispatchDocumentSocket('Actor', 'get', {
            query: { _id: id },
            broadcast: false
        });
        const actorData = response?.result?.[0]; // Expecting single result

        if (!actorData) throw new Error(`Actor not found: ${id}`);

        return await adapter.normalizeActorData(actorData);
    }

    private async fetchManifest(baseUrl: string, type: 'systems' | 'modules', id: string): Promise<any> {
        try {
            const url = `${baseUrl}/${type}/${id}/${type === 'systems' ? 'system.json' : 'module.json'}`;

            // We need a session cookie for this. if we don't have it, we might fail.
            const headers: any = {
                'User-Agent': 'SheetDelver/1.0'
            };
            if (this.sessionCookie) {
                headers['Cookie'] = this.sessionCookie;
            }

            const res = await fetch(url, { headers });
            if (res.ok) return await res.json();
        } catch (e) {
            logger.warn(`SocketFoundryClient | Failed to fetch manifest for ${type}/${id}: ${e}`);
        }
        return null;
    }

    async fetchGameData(): Promise<any> {
        if (this.gameDataCache) return this.gameDataCache;
        if (!this.sessionCookie) return null;

        const currentUrl = this.config.url || '';
        const baseUrl = currentUrl.endsWith('/') ? currentUrl.slice(0, -1) : currentUrl;
        try {
            logger.info('SocketFoundryClient | Fetching world configuration (gameData)...');
            const res = await fetch(`${baseUrl}/game`, {
                headers: {
                    'Cookie': this.sessionCookie,
                    'User-Agent': 'SheetDelver/1.0'
                }
            });

            if (!res.ok) throw new Error(`Failed to fetch /game: ${res.status}`);
            const html = await res.text();

            logger.info(`SocketFoundryClient | (V2 DEBUG) gamePage HTML fetched. Length: ${html.length}`);
            logger.debug(`SocketFoundryClient | (V2 DEBUG) HTML Preview: ${html.substring(0, 500)}`);

            if (html.length < 1000) {
                logger.warn(`SocketFoundryClient | (V2 DEBUG) HTML suspiciously short. Potential redirect or login page?`);
            }

            // Extract gameData from script tags
            // V13 usually uses JSON.parse for efficiency
            const parseMatch = html.match(/const gameData = JSON\.parse\('(.*?)'\);/);
            if (parseMatch) {
                try {
                    // Foundry escapes single quotes in the JSON string
                    const rawJson = parseMatch[1].replace(/\\'/g, "'");
                    this.gameDataCache = JSON.parse(rawJson);
                    logger.info('SocketFoundryClient | extracted gameData via JSON.parse');
                } catch (e) {
                    logger.warn(`Secondary parse failed: ${e}`);
                }
            }

            // Fallback for older versions or literal assignment
            if (!this.gameDataCache) {
                const literalMatch = html.match(/const gameData = ({[\s\S]*?});\s*$/m);
                if (literalMatch) {
                    try {
                        // This is dangerous but we are in a trusted environment probing our own server
                        // For safety, let's try to parse as JSON if it looks clean
                        this.gameDataCache = JSON.parse(literalMatch[1]);
                        logger.info('SocketFoundryClient | extracted gameData via literal match');
                    } catch (e) {
                        logger.warn(`Literal parse failed: ${e}`);
                    }
                }
            }

            if (this.gameDataCache) {
                // Update active modules list from gameData
                if (this.gameDataCache.modules) {
                    this.activeModules = this.gameDataCache.modules;
                }
                return this.gameDataCache;
            }
        } catch (e) {
            logger.error(`SocketFoundryClient | Failed to fetch gameData: ${e}`);
        }
        return null;
    }

    async getAllCompendiumIndices(): Promise<any[]> {
        if (!this.isConnected) return [];

        // Only the System Client (Service Account) should perform discovery
        if (!this.isSystemClient) {
            logger.debug('SocketFoundryClient | Skipping compendium discovery for user client.');
            return [];
        }

        try {
            // Use Cached World Data (gameData) as the single source of truth
            const game = this.gameDataCache || await this.fetchGameData();
            if (!game) {
                logger.warn('SocketFoundryClient | No gameData available for discovery.');
                return [];
            }

            const packs = new Map<string, any>();

            // 1. Discovery from World
            if (game.world?.packs) {
                game.world.packs.forEach((p: any) => {
                    const id = p.id || p._id || `${p.system}.${p.name}` || p.name;
                    packs.set(id, { ...p, source: 'world' });
                });
            }

            // 2. Discovery from System
            if (game.system?.packs) {
                game.system.packs.forEach((p: any) => {
                    const id = p.id || p._id || `${game.system.id}.${p.name}` || p.name;
                    if (!packs.has(id)) packs.set(id, { ...p, system: game.system.id, source: 'system' });
                });
            }

            // 3. Discovery from Modules
            if (game.modules) {
                game.modules.forEach((mod: any) => {
                    if (mod.packs) {
                        mod.packs.forEach((p: any) => {
                            const id = p.id || p._id || `${mod.id}.${p.name}` || p.name;
                            if (!packs.has(id)) packs.set(id, { ...p, module: mod.id, source: 'module' });
                        });
                    }
                });
            }

            // logger.debug(`SocketFoundryClient | Aggregated ${packs.size} compendium packs from gameData.`);

            // 4. Fetch Indices for each pack
            const results = [];
            for (const [packId, metadata] of packs.entries()) {
                // Determine Document Type (Default to Item if unknown)
                const docType = metadata.type || metadata.entity || metadata.documentName || 'Item';

                // Fetch index (This still uses the socket, which is efficient)
                const index = await this.getPackIndex(packId, docType);
                results.push({
                    id: packId,
                    metadata: metadata,
                    index: index
                });
            }

            return results;
        } catch (e) {
            logger.warn(`getAllCompendiumIndices failed: ${e}`);
            return [];
        }
    }

    async updateActor(id: string, data: any): Promise<any> {
        // Update uses 'updates' array in operation
        return await this.dispatchDocumentSocket('Actor', 'update', { updates: [{ _id: id, ...data }] });
    }

    async createActor(data: any): Promise<any> {
        // Create uses 'data' array in operation
        const response = await this.dispatchDocumentSocket('Actor', 'create', { data: [data] });
        // Response.result is array of created docs
        return response?.result?.[0];
    }

    async deleteActor(id: string): Promise<any> {
        // Delete uses 'ids' array in operation
        return await this.dispatchDocumentSocket('Actor', 'delete', { ids: [id] });
    }

    async updateActorEffect(actorId: string, effectId: string, updateData: any): Promise<any> {
        return await this.dispatchDocumentSocket('ActiveEffect', 'update',
            { updates: [{ _id: effectId, ...updateData }] },
            { type: 'Actor', id: actorId }
        );
    }

    async deleteActorEffect(actorId: string, effectId: string): Promise<any> {
        return await this.dispatchDocumentSocket('ActiveEffect', 'delete',
            { ids: [effectId] },
            { type: 'Actor', id: actorId }
        );
    }

    async createActorItem(actorId: string, itemData: any): Promise<any> {
        const response = await this.dispatchDocumentSocket('Item', 'create',
            { data: [itemData] },
            { type: 'Actor', id: actorId }
        );
        return response?.result?.[0]?._id;
    }

    async updateActorItem(actorId: string, itemData: any): Promise<any> {
        const { _id, id, ...updates } = itemData;
        const targetId = _id || id;
        return await this.dispatchDocumentSocket('Item', 'update',
            { updates: [{ _id: targetId, ...updates }] },
            { type: 'Actor', id: actorId }
        );
    }

    async deleteActorItem(actorId: string, itemId: string): Promise<any> {
        return await this.dispatchDocumentSocket('Item', 'delete',
            { ids: [itemId] },
            { type: 'Actor', id: actorId }
        );
    }

    async render(): Promise<any> {
        logger.warn(`SocketFoundryClient | render() not supported.`);
        return null as any;
    }

    async toggleStatusEffect(actorId: string, effectId: string, active?: boolean): Promise<any> {
        // Fetch existing effects first to see if it exists
        const response: any = await this.dispatchDocumentSocket('Actor', 'get', {
            query: { _id: actorId },
            broadcast: false
        });
        const actor = response?.result?.[0];
        if (!actor) return false;

        const existingEffect = actor.effects?.find((e: any) => e.flags?.core?.statusId === effectId || e.id === effectId);

        if (active === false && existingEffect) {
            await this.deleteActorEffect(actorId, existingEffect._id || existingEffect.id);
            return false;
        }

        if (active === true && !existingEffect) {
            const effectData = {
                id: effectId,
                label: effectId.charAt(0).toUpperCase() + effectId.slice(1),
                icon: `icons/svg/${effectId}.svg`, // Generic fallback
                disabled: false,
                flags: {
                    core: {
                        statusId: effectId
                    }
                }
            };

            await this.dispatchDocumentSocket('ActiveEffect', 'create',
                { data: [effectData] },
                { type: 'Actor', id: actorId }
            );
            return true;
        }

        // Toggle behavior if active is undefined
        if (active === undefined) {
            if (existingEffect) {
                await this.deleteActorEffect(actorId, existingEffect._id || existingEffect.id);
                return false;
            } else {
                const effectData = {
                    id: effectId,
                    label: effectId.charAt(0).toUpperCase() + effectId.slice(1),
                    icon: `icons/svg/${effectId}.svg`, // Generic fallback
                    disabled: false,
                    flags: {
                        core: {
                            statusId: effectId
                        }
                    }
                };
                await this.dispatchDocumentSocket('ActiveEffect', 'create',
                    { data: [effectData] },
                    { type: 'Actor', id: actorId }
                );
                return true;
            }
        }

        return !!existingEffect;
    }

    async fetchByUuid(uuid: string): Promise<any> {
        if (!this.isSocketConnected) throw new Error("Socket not connected");

        // 1. Compendium UUIDs
        if (uuid.startsWith("Compendium.")) {
            // Format: Compendium.<packName>.<DocumentName>.<ID>
            // Example: Compendium.system-id.pack-name.DocumentType.ID
            const parts = uuid.split('.');
            if (parts.length < 4) throw new Error(`Invalid Compendium UUID format: ${uuid}`);

            const id = parts.pop();
            const type = parts.pop();
            // The rest is "Compendium" + packName parts. Slice 1 to remove "Compendium"
            const pack = parts.slice(1).join('.');

            if (!id || !type || !pack) throw new Error(`Invalid Compendium UUID parts: ${uuid}`);

            const response: any = await this.dispatchDocumentSocket(type, 'get', {
                pack: pack,
                query: { _id: id },
                broadcast: false
            });
            return response?.result?.[0] || null;
        }

        const parts = uuid.split('.');

        // 2. World Document UUIDs (Type.Id) e.g. Actor.xyz
        if (parts.length === 2) {
            const [type, id] = parts;
            const response: any = await this.dispatchDocumentSocket(type, 'get', {
                query: { _id: id },
                broadcast: false
            });
            return response?.result?.[0] || null;
        }

        // 3. Embedded (Actor.Id.Item.Id)
        if (parts.length === 4) {
            const [parentType, parentId, docType, docId] = parts;
            const response: any = await this.dispatchDocumentSocket(docType, 'get', {
                query: { _id: docId },
                broadcast: false
            }, { type: parentType, id: parentId });
            return response?.result?.[0] || null;
        }

    }

    async getPackIndex(packId: string, type: string): Promise<any[]> {
        // Fetch all documents from a pack
        // v13 preferred: getCompendiumIndex
        try {
            logger.debug(`SocketFoundryClient | Fetching index for pack ${packId} (type: ${type})...`);

            // Try getCompendiumIndex first as it is more efficient for just the index
            try {
                const response: any = await this.emit('getCompendiumIndex', { pack: packId }, 10000);
                if (Array.isArray(response)) return response;
                if (response?.result) return response.result;
            } catch (e) {
                logger.debug(`SocketFoundryClient | getCompendiumIndex failed for ${packId}, falling back to modifyDocument: ${e}`);
            }

            // Fallback to modifyDocument with pack arg
            const response: any = await this.dispatchDocumentSocket(type, 'get', {
                pack: packId,
                broadcast: false
            });
            return response?.result || [];
        } catch (e) {
            logger.warn(`getPackIndex failed for ${packId}: ${e}`);
            return [];
        }
    }

    async getChatLog(limit = 100): Promise<any[]> {
        // v13 Protocol: get documents for ChatMessage
        const response: any = await this.dispatchDocumentSocket('ChatMessage', 'get', { broadcast: false });
        const raw = (response?.result || []).slice(-limit).reverse();

        return raw.map((msg: any) => {
            // Map author ID to Name
            const authorUser = this.userMap.get(msg.author);
            const authorName = authorUser?.name || msg.alias || 'Unknown';

            // Normalize for UI
            return {
                ...msg,
                user: authorName,
                timestamp: msg.timestamp || Date.now(),
                isRoll: msg.type === 5, // Foundry CONST.CHAT_MESSAGE_TYPES.ROLL is 5
                rollTotal: msg.rolls?.[0]?.total, // Simplistic extraction
                flavor: msg.flavor
            };
        });
    }

    async sendMessage(content: string | any): Promise<any> {
        if (!this.userId) throw new Error("Cannot send chat message: User ID not determined.");

        const data = typeof content === 'string'
            ? { content, type: 1, author: this.userId }
            : { type: 1, author: this.userId, ...content };

        return await this.dispatchDocumentSocket('ChatMessage', 'create', {
            data: [data]
        });
    }

    async roll(formula: string, flavor?: string): Promise<any> {
        // Basic roll simply posts to chat for now
        return await this.sendMessage(`Rolling ${formula}: ${flavor || ''}`);
    }

    async useItem(actorId: string, itemId: string): Promise<any> {
        // Without full game client logic, best we can do is post a chat card
        const actor = await this.getActor(actorId);
        const item = actor.items?.find((i: any) => i._id === itemId || i.id === itemId);

        if (!item) return false;

        await this.sendMessage(`<b>${actor.name}</b> uses <b>${item.name}</b>`);
        return true;
    }

    async getWorlds(): Promise<any[]> {
        try {
            const { SetupScraper } = await import('../SetupScraper');
            const cache = await SetupScraper.loadCache();
            if (cache.worlds) {
                this.cachedWorlds = cache.worlds;
            }
            return Object.values(cache.worlds || {});
        } catch (e) {
            logger.warn(`SocketFoundryClient | Failed to get worlds: ${e}`);
            return [];
        }
    }

    async launchWorld(worldId: string): Promise<void> {
        logger.info(`SocketFoundryClient | Requesting launch of world: ${worldId}`);
        if (this.socket) {
            this.socket.emit('launchWorld', worldId);
            this.lastLaunchActivity = Date.now();
        } else {
            throw new Error("Socket not connected");
        }
    }

    async shutdownWorld(): Promise<void> {
        logger.info(`SocketFoundryClient | Requesting world shutdown`);
        if (this.socket) {
            this.isShuttingDown = true;
            this.socket.emit('shutdown');
        } else {
            throw new Error("Socket not connected");
        }
    }

    public getSocketState() {
        return {
            connected: this.isSocketConnected,
            worldState: this.worldState,
            userId: this.userId,
            isExplicit: this.isExplicitSession,
            isSystem: this.isSystemClient
        };
    }
}
