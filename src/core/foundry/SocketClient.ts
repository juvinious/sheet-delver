import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FoundryConfig } from './types';
import { FoundryClient, SystemInfo } from './interfaces';
import { ConnectionStatus, ServerConnectionStatus } from '@/shared/connection';
import { getAdapter } from '../../modules/core/registry';
import { SystemAdapter } from '../../modules/core/interfaces';
import { SetupScraper, WorldData, CacheData } from './SetupScraper';
import { logger } from '../logger';
import { CompendiumCache } from './compendium-cache';

export class SocketFoundryClient implements FoundryClient {
    private config: FoundryConfig;
    private adapter: SystemAdapter | null = null;
    private socket: Socket | null = null;
    private sessionCookie: string | null = null;
    private discoveredUserId: string | null = null;
    public userId: string | null = null;
    private isJoining: boolean = false;
    private isShuttingDown: boolean = false;
    public isExplicitSession: boolean = false;
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
        // As long as we have explicitly established a session, we consider ourselves logged in.
        // This prevents the frontend from kicking the user during transient socket reconnections
        // or moments where the userId is being re-confirmed by the server.
        // Definitive session termination only happens via logout() or a confirmed kick.
        return this.isExplicitSession;
    }
    private worldTitleFromHtml: string | null = null;
    private worldBackgroundFromHtml: string | null = null;
    private validationFailCount: number = 0;
    private consecutiveFailures: number = 0;
    public isAuthenticating: boolean = false;
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

    constructor(config: FoundryConfig) {
        this.config = config;
        this.loadInitialCache();
    }

    private async loadInitialCache() {
        try {
            const cache = await SetupScraper.loadCache();
            // Store the cache map but DO NOT pre-select a world
            // We must wait for socket verification in connect()
            this.cachedWorlds = cache.worlds || {};
        } catch (e) {
            logger.warn('SocketFoundryClient | Failed to load initial cache: ' + e);
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

        // 3. Active World - Determine authentication level
        if (this.worldState === 'active') {
            if (this.isLoggedIn) {
                return 'loggedIn';
            }
            if (this.isSocketConnected) {
                return 'connected';
            }
            // Fallback for legacy compatibility
            return 'active';
        }

        // 4. Default - Disconnected
        return 'disconnected';
    }

    // ... (get url, resolveAdapter methods unchanged)

    // ... (login, logout methods - ensure they match existing)

    get url(): string {
        return this.config.url;
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
        try {
            if (this.isConnected) {
                this.disconnect();
            }
            await this.connect();

            // wait for authenticated session AND active status
            const timeout = 30000;
            await this.waitForAuthentication(timeout);

            this.isExplicitSession = true;
        } catch (e: any) {
            logger.error(`SocketFoundryClient | Login exception: ${e.message}`);
            this.disconnect(`Login failure: ${e.message}`);
            throw e;
        } finally {
            this.isAuthenticating = false;
        }
    }

    private async waitForAuthentication(timeoutMs: number): Promise<void> {
        logger.info(`SocketFoundryClient | Waiting for authentication (timeout: ${timeoutMs}ms)...`);
        const start = Date.now();
        // Optimistic: We only wait up to 5s for the active status. 
        // If we have the userId from the session event, we are effectively logged in.
        while (Date.now() - start < 5000) {
            if (this.userId) {
                try {
                    const users = await this.getUsers();
                    const me = users.find((u: any) => (u._id || u.id) === this.userId);
                    if (me?.active) {
                        logger.info(`SocketFoundryClient | User ${this.userId} is active.`);
                        return;
                    }
                } catch { }
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
        logger.info('SocketFoundryClient | Resetting client state.');
        this.userMap.clear();
        this.worldCache.clear();
        this.actorCache.clear();
        this.cachedWorldData = null;
        this.worldTitleFromHtml = null;
        this.worldBackgroundFromHtml = null;
        this.isExplicitSession = false;
        this.userId = null;
        this.discoveredUserId = null;
        this.sessionCookie = null;
        this.consecutiveFailures = 0;
        this.validationFailCount = 0;
        // 4. Ensure Setup State if not already
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
        this.cachedWorlds = cache.worlds || {};

        // Initialize Compendium Cache in background
        CompendiumCache.getInstance().initialize(this).catch(e => logger.warn(`CompendiumCache init failed: ${e}`));


        const baseUrl = this.config.url.endsWith('/') ? this.config.url.slice(0, -1) : this.config.url;

        // 1. Authenticate if username provided
        // 1. Authenticate if username provided
        if (this.config.username) {
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
                    logger.info(`SocketFoundryClient | Active world matches cache entry (${worldId}). fusing data.`);
                    if (users.length === 0 && cached.users) {
                        users = cached.users; // Use cached users if socket was silent
                    }
                    if (!worldTitle && cached.worldTitle) {
                        logger.info(`SocketFoundryClient | Using cached worldTitle: "${cached.worldTitle}"`);
                        worldTitle = cached.worldTitle;
                    }
                } else {
                    logger.info(`SocketFoundryClient | No cache entry found for world "${worldId}".`);
                }

                this.cachedWorldData = {
                    ...discoveryData,
                    worldTitle: worldTitle || discoveryData.worldTitle,
                    backgroundUrl: cached?.backgroundUrl || discoveryData.backgroundUrl,
                    users: users
                };

                logger.info(`SocketFoundryClient | cachedWorldData set with worldTitle: "${this.cachedWorldData.worldTitle}"`);

                // D. IDENTIFY USER
                let userId: string | null = null;

                // 1. Try to find in (Socket) Users
                const targetUser = users.find((u: any) => u.name === this.config.username);
                if (targetUser) {
                    userId = targetUser._id || (targetUser as any).id;
                }

                // 2. If not found, and we have a cache match, use cached ID
                if (!userId && cached) {
                    const cachedUser = cached.users?.find((u: any) => u.name === this.config.username);
                    if (cachedUser) {
                        userId = cachedUser._id || (cachedUser as any).id;
                        logger.info(`SocketFoundryClient | Identified User ID from cache: ${userId}`);
                    }
                }

                // 3. Fail if still missing
                if (!userId) {
                    throw new Error(`User "${this.config.username}" could not be identified in world "${worldId}". (Socket discovery empty, Cache mismatch).`);
                }

                this.userId = userId;
                logger.info(`SocketFoundryClient | Identified User ID: ${this.userId}`);


                // E. EXPLICIT AUTHENTICATION (POST /join)
                if (!csrfToken) logger.warn('SocketFoundryClient | No CSRF Token found. Login might fail.');

                logger.info('SocketFoundryClient | Performing Explicit POST Login...');
                const loginResponse = await fetch(`${baseUrl}/join`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': guestCookie,
                        'User-Agent': 'SheetDelver/1.0',
                        'Origin': baseUrl,
                        'Referer': `${baseUrl}/join`
                    },
                    body: JSON.stringify({
                        userid: userId,
                        password: this.config.password || '',
                        action: 'join',
                        'csrf-token': csrfToken
                    }),
                    redirect: 'manual'
                });

                addCookies(loginResponse.headers.get('set-cookie'));

                // Verify Login Success
                const loginBody = await loginResponse.text();
                if (loginResponse.status !== 200 && loginResponse.status !== 302) {
                    throw new Error(`Authentication Failed: Server returned status ${loginResponse.status}. Invalid credentials or expired session.`);
                }

                // Final Session Cookie
                this.sessionCookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

            } catch (e: any) {
                // If anything in the discovery/auth flow fails, we must NOT proceed to open the main socket.
                logger.error(`SocketFoundryClient | Handshake error: ${e.message}`);
                throw e;
            }
        }


        // 2. Establish Socket Connection
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

            const headers = {
                'Cookie': this.sessionCookie || '',
                'User-Agent': 'SheetDelver/1.0',
                'Origin': baseUrl
            };

            logger.info(`SocketFoundryClient | Connecting to socket at ${baseUrl}...`);

            // @ts-ignore
            this.socket = io(baseUrl, {
                path: '/socket.io',
                transports: ['websocket'],
                reconnection: true,
                forceNew: true,
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
                logger.info('SocketFoundryClient | Connected to WebSocket. socket.id: ' + socket.id);
                this.isSocketConnected = true;
                logger.info('SocketFoundryClient | State Change: isSocketConnected = true');

                // Always verify system status on connection or reconnection
                logger.info(`SocketFoundryClient | Connected. Verifying system status (Current: ${this.worldState})...`);
                // Allow a brief moment for server to settle if just launched
                setTimeout(() => this.getSystem().catch(e => logger.warn('State refresh failed:', e)), 500);

                // RESOLVE immediately on low-level connection. 
                // Session-level wait is handled by waitForAuthentication()
                resolve();
            });

            socket.on('disconnect', (reason) => {
                logger.warn('SocketFoundryClient | Socket disconnected. Reason: ' + reason);
                this.isSocketConnected = false;
                logger.info('SocketFoundryClient | State Change: isSocketConnected = false (disconnect)');

                // If we requested a shutdown, or server kicked us during shutdown,
                // we should be in setup mode now.
                if (this.isShuttingDown || reason === 'io server disconnect') {
                    this.worldState = 'setup';
                    this.isShuttingDown = false;
                    this.resetState();
                } else if (this.worldState !== 'setup') {
                    this.worldState = 'offline';
                }
                // DO NOT clear isExplicitSession here. 
                // We want to allow the client to stay "Logged In" during reconnections.
            });

            socket.io.on('reconnect_attempt', (attempt) => {
                logger.info('SocketFoundryClient | Reconnect attempt: ' + attempt);
            });

            socket.io.on('error', (error) => {
                logger.error('SocketFoundryClient | Socket.io error: ' + error);
            });

            // Handle when user is kicked/disconnected from Foundry
            socket.on('userDisconnected', (data: any) => {
                const id = data.userId || data._id || data.id;
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

            socket.onAny((event, ...args) => {
                if (process.env.NODE_ENV !== 'production' && !this.isConnected) {
                    // Log during connection phase, then quiet down
                    if (event !== 'userActivity') {
                        logger.debug(`>>> SOCKET EVENT: ${event} | ${JSON.stringify(args).substring(0, 200)}`);
                    }
                }



                if (event === 'session') {
                    const data = args[0] || {};

                    // NOTE: We no longer promote to 'active' just from a session event.
                    // This prevents the Setup page socket from triggering an 'active' state.
                    // Promotion to 'active' now only happens via successful getSystem() calls
                    // or successful HTML-based title refreshes from /game.

                    if (data.userId) {
                        logger.info(`SocketFoundryClient | Session event. Authenticated as ${data.userId}`);
                        this.discoveredUserId = data.userId;
                        this.userId = data.userId;
                    } else {
                        logger.info(`SocketFoundryClient | Session event. Guest session (userId: null).`);
                        this.userId = null;
                    }

                    this.isSocketConnected = true;
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
                        if (this.isSetupMode) {
                            logger.info(`SocketFoundryClient | World launch detected (${data.pct}%). Clearing Setup Mode flag.`);
                            // Transition from 'setup' to 'offline' (intermediate) -> 'startup' (via status getter logic)
                            this.worldState = 'offline';
                            this.lastLaunchActivity = Date.now();
                            // Clear world cache when new world starts launching
                            this.worldCache.clear();
                            this.worldTitleFromHtml = null;
                            this.worldBackgroundFromHtml = null;
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
                                        systemId: cached.systemId,
                                        backgroundUrl: cached.backgroundUrl,
                                        users: cached.users || [],
                                        lastUpdated: cached.lastUpdated
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
                    logger.info(`SocketFoundryClient | Active users: ${activeUserIds.length}`);
                    if (payload.users) {
                        logger.info(`SocketFoundryClient | Populating user map with ${payload.users.length} users from ready event.`);
                        payload.users.forEach((u: any, i: number) => {
                            const id = u._id || u.id;
                            const isActive = activeUserIds.includes(id) || u.active === true;
                            if (i < 3) logger.info(`SocketFoundryClient | User ${u.name} (${id}) | active: ${isActive} (doc active: ${u.active})`);
                            this.userMap.set(id, { ...u, active: isActive });
                        });
                    }

                    this.isSocketConnected = true;
                    this.isJoining = false;
                    resolve();
                }

                // World Shutdown Detection
                if (event === 'shutdown') {
                    const data = args[0] || {};
                    logger.info(`SocketFoundryClient | World shutdown detected: ${data.world || 'unknown'}`);
                    // World has shut down, we're back in setup mode
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
                    systemId: cached.systemId,
                    backgroundUrl: cached.backgroundUrl,
                    users: cached.users || [],
                    lastUpdated: cached.lastUpdated
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
                logger.info(`SocketFoundryClient | EMIT [${requestId}]: ${event}`, JSON.stringify(payload));
            }

            socket.emit(event, payload, (response: any) => {
                if (process.env.NODE_ENV !== 'production') {
                    const responseStr = JSON.stringify(response);
                    logger.info(`SocketFoundryClient | RESPONSE [${requestId}]: ${event}`, responseStr.length > 500 ? responseStr.substring(0, 500) + "..." : responseStr);
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
                status: this.status
            };
        }

        // 2. Connection Check
        // If socket is disconnected, we report it.
        if (!this.isSocketConnected) {
            const cached: any = this.cachedWorldData || {};
            return {
                id: cached.systemId || 'unknown',
                title: cached.systemId ? (cached.systemId.charAt(0).toUpperCase() + cached.systemId.slice(1)) : 'Reconnecting...',
                version: '0.0.0',
                worldTitle: cached.worldTitle || 'Reconnecting...',
                worldBackground: cached.worldBackground,
                isLoggedIn: this.isLoggedIn,
                status: this.status
            };
        }

        // 3. Setup Mode Check
        // If we're in setup mode, don't attempt to fetch documents (they don't exist)
        // Return cached data from the last active world or setup page scraping
        if (this.worldState === 'setup') {
            const cached: any = this.cachedWorldData || {};
            return {
                id: cached.systemId || 'unknown',
                title: cached.systemId ? (cached.systemId.charAt(0).toUpperCase() + cached.systemId.slice(1)) : 'Setup Mode',
                version: '0.0.0',
                worldTitle: cached.worldTitle || 'No World Active',
                worldBackground: cached.backgroundUrl || `${this.url}/ui/denim075.png`,
                isLoggedIn: this.isLoggedIn,
                status: 'setup'
            };
        }

        const cached = this.worldCache.get(this.url) || {};
        const scraperCache = this.cachedWorldData;

        const sysData: SystemInfo = {
            id: scraperCache?.systemId || cached.id || 'shadowdark',
            title: cached.title || (scraperCache?.systemId ? scraperCache.systemId : 'Shadowdark RPG'),
            version: cached.version || '1.0.0',
            worldTitle: this.worldTitleFromHtml || scraperCache?.worldTitle || cached.worldTitle || 'Foundry World',
            worldDescription: cached.worldDescription || '',
            worldBackground: this.worldBackgroundFromHtml || scraperCache?.backgroundUrl || cached.worldBackground || `${this.url}/ui/denim075.png`,
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
            if (!this.userId && this.worldState === 'active') {
                logger.debug(`SocketFoundryClient | Skipping modifyDocument for guest session (world active). Using cached data.`);
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
                    if (sysData.id !== 'shadowdark' && sysData.title === 'Shadowdark RPG') {
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
            return {
                id,
                name: u.name,
                isGM: (u.role || 0) >= 3, // Role 3 is Assistant GM, Role 4 is GM
                active: id === this.userId || u.active === true,
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

    async getAllCompendiumIndices(): Promise<any[]> {
        return [];
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

    async getChatLog(limit = 100): Promise<any[]> {
        // v13 Protocol: get documents for ChatMessage
        const response: any = await this.dispatchDocumentSocket('ChatMessage', 'get', { broadcast: false });
        return (response?.result || []).slice(-limit).reverse();
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
            const { SetupScraper } = await import('./SetupScraper');
            const cache = await SetupScraper.loadCache();
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
}
