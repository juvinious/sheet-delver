import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FoundryConfig } from './types';
import { FoundryClient, SystemConnectionData } from './interfaces';
import { ConnectionStatus } from '../../types/connection';
import { getAdapter } from '../../modules/core/registry';
import { SystemAdapter } from '../../modules/core/interfaces';
import { SetupScraper, WorldData } from './SetupScraper';
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
    public isExplicitSession: boolean = false;
    // isConnected is now a computed getter in the strict architecture

    // Strict Separation Implementation
    public isSocketConnected: boolean = false;
    public worldState: 'offline' | 'setup' | 'active' = 'offline';

    // Cache SetupScraper Data
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
    // Setup/Ready flags are now computed from worldState
    private disconnectReason: string | null = null;
    private readonly STARTUP_WINDOW_MS = 30000; // 30 seconds
    private userMap: Map<string, any> = new Map();
    private actorCache: Map<string, string> = new Map();
    private worldCache: Map<string, Partial<SystemConnectionData>> = new Map();

    constructor(config: FoundryConfig) {
        this.config = config;
    }

    get status(): ConnectionStatus {
        // 1. Setup Mode
        if (this.worldState === 'setup') {
            return 'setup';
        }

        // 2. Authenticating (Transient)
        if (this.isAuthenticating) {
            return 'authenticating';
        }

        // 3. Active World (Ready) - Prioritize explicit active state over timers
        if (this.worldState === 'active') {
            if (this.isUserAuthenticated) return 'loggedIn';
            return 'connected'; // Ready but not logged in (Guest or Login Screen)
        }

        // 4. Startup / Transient Connection
        // If socket is open but we aren't confirmed active yet
        if (this.isSocketConnected) {
            // Check startup window
            if (this.lastLaunchActivity > 0 && Date.now() - this.lastLaunchActivity < this.STARTUP_WINDOW_MS) {
                return 'startup';
            }
            return 'connected';
        }

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

    async logout(): Promise<void> {
        logger.info(`SocketFoundryClient | Logging out user ${this.userId}`);
        this.isExplicitSession = false;
        this.userId = null;
        this.sessionCookie = null;
        this.disconnect("User logged out explicitly");
    }

    async connect(): Promise<void> {
        // Socket connection is now considered stable for v13.

        if (this.isConnected) return;

        if (this.isConnected) return;

        // Initialize Compendium Cache in background
        CompendiumCache.getInstance().initialize(this).catch(e => logger.warn(`CompendiumCache init failed: ${e}`));

        // Reset world data on new connection attempt to ensure freshness
        this.worldTitleFromHtml = null;
        this.worldBackgroundFromHtml = null;
        this.cachedWorldData = null; // Clear old cache on new connection attempt
        // Check for setup mode via state
        if (this.worldState === 'setup') {
            // already handled
        }


        const baseUrl = this.config.url.endsWith('/') ? this.config.url.slice(0, -1) : this.config.url;

        // 1. Authenticate if username provided
        if (this.config.username) {
            logger.info(`SocketFoundryClient | Authenticating as ${this.config.username}...`);
            try {
                // Initialize cookie handling
                const cookieMap = new Map<string, string>();
                const addCookies = (header: string | null) => {
                    if (!header) return;
                    // Handle multiple cookies in set-cookie header
                    // Note: set-cookie might be a comma-separated list or distinct headers depending on fetch implementation
                    // Simple split might be naive for cookies with dates, but sufficient for session IDs
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

                // Check if we were redirected to setup
                const isSetup = joinResponse.url.includes('/setup') || html.includes('id="setup"');
                if (isSetup) {
                    logger.info('SocketFoundryClient | Detected Setup Mode via title/redirect.');
                    this.worldState = 'setup';
                } else {
                    // If not setup, and we are connected, we assume active/ready? 
                    // Or we wait for 'ready' event?
                    // Safest is to leave it alone or set to 'offline' if we just connected?
                    // But we are in the connect() success path.
                    // If we don't know, we wait.
                }

                // Parse World Title & Background from Login/Setup Page
                // 1. Title
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    let rawTitle = titleMatch[1].trim();
                    rawTitle = rawTitle.replace(/^Foundry Virtual Tabletop [\u2022\u00B7\-|]\s*/i, '');
                    this.worldTitleFromHtml = rawTitle;
                    logger.info(`SocketFoundryClient | Parsed World/System Title: "${this.worldTitleFromHtml}"`);
                }

                // 2. Background - load from cache if available
                const { SetupScraper } = await import('./SetupScraper');
                const cache = await SetupScraper.loadCache();

                // Persist cache for getSystem fallback
                if (cache.currentWorldId && cache.worlds[cache.currentWorldId]) {
                    this.cachedWorldData = cache.worlds[cache.currentWorldId];
                    logger.info(`SocketFoundryClient | Cached world data loaded for: ${this.cachedWorldData.worldTitle}`);
                }

                let userId: string | undefined;
                let backgroundUrl: string | null = null;

                if (this.cachedWorldData) {
                    const worldData = this.cachedWorldData;
                    backgroundUrl = worldData.backgroundUrl;
                    this.worldBackgroundFromHtml = backgroundUrl;

                    // Find user ID from cache
                    const cachedUser = worldData.users.find(u => u.name === this.config.username);
                    if (cachedUser) {
                        userId = cachedUser._id;
                        logger.info(`SocketFoundryClient | Loaded User ID from cache: ${userId}`);
                    } else {
                        logger.warn(`SocketFoundryClient | User "${this.config.username}" not found in cached world data`);
                    }
                } else {
                    logger.warn(`SocketFoundryClient | No cached world data found. Setup required.`);
                    // Fallback: parse background from HTML
                    const cssVarMatch = html.match(/--background-url:\s*url\((['"]?)(.*?)\1\)/i);
                    const bgImageMatch = html.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);

                    if (cssVarMatch) {
                        backgroundUrl = cssVarMatch[2].trim();
                    } else if (bgImageMatch) {
                        backgroundUrl = bgImageMatch[2].trim();
                    }

                    if (backgroundUrl && !backgroundUrl.startsWith('http')) {
                        const path = backgroundUrl.startsWith('/') ? backgroundUrl : `/${backgroundUrl}`;
                        backgroundUrl = `${baseUrl}${path}`;
                    }
                }
                this.worldBackgroundFromHtml = backgroundUrl;

                // CACHE UPDATE: Preserve parsed world info
                if (this.worldTitleFromHtml) {
                    const cached = this.worldCache.get(this.url) || {};
                    this.worldCache.set(this.url, { ...cached, worldTitle: this.worldTitleFromHtml, worldBackground: this.worldBackgroundFromHtml || undefined });
                }

                // Use config userId as fallback
                if (!userId) {
                    userId = this.config.userId;
                }

                if (!userId) {
                    throw new Error(`No User ID available. Please run setup at /setup to configure your Foundry connection.`);
                }

                this.discoveredUserId = userId;

                // Extract CSRF Token
                const csrfMatch = html.match(/name="csrf-token" content="(.*?)"/) || html.match(/input type="hidden" name="csrf" value="(.*?)"/);
                const csrfToken = csrfMatch ? csrfMatch[1] : null;

                if (csrfToken) {
                    logger.info(`SocketFoundryClient | Found CSRF Token: ${csrfToken.substring(0, 10)}...`);
                } else {
                    logger.warn(`SocketFoundryClient | No CSRF Token found. Login might fail.`);
                }

                // Add Origin and Referer for strict security checks
                const postHeaders = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'SheetDelver/1.0',
                    'Origin': baseUrl,
                    'Referer': `${baseUrl}/join`,
                    'Cookie': Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
                };

                const bodyData: any = {
                    userid: userId,
                    username: this.config.username, // Include username explicitly for hidden user fallback
                    password: this.config.password || '',
                    action: 'join'
                };
                if (csrfToken) {
                    bodyData['csrf-token'] = csrfToken; // Foundry usually expects 'csrf-token' key or 'csrf'
                    bodyData['csrf'] = csrfToken;       // Send both to be safe
                }

                const loginResponse = await fetch(`${baseUrl}/join`, {
                    method: 'POST',
                    headers: postHeaders,
                    body: JSON.stringify(bodyData),
                    redirect: 'manual'
                });

                addCookies(loginResponse.headers.get('set-cookie'));

                const loginBody = await loginResponse.text();
                logger.info(`SocketFoundryClient | Login POST status: ${loginResponse.status}`);

                // Success could be 302 (Redirect), 200 (JSON Success), or even 200 (HTML with cookie).
                // We rely on the subsequent /game check to verify if the session is valid.

                const isJsonSuccess = loginResponse.status === 200 && (loginBody.includes('"status":"success"') || loginBody.includes('JOIN.LoginSuccess'));
                const isRedirect = loginResponse.status === 302;

                const hasSessionCookie = cookieMap.has('session') || cookieMap.has('foundry');

                // CRITICAL: specific fail check. If it's NOT success, we MUST throw.
                // We cannot fall through because we might have a guest cookie that looks valid.
                if (!isRedirect && !isJsonSuccess && !hasSessionCookie) {
                    const bodyPreview = loginBody.substring(0, 300);
                    logger.error(`SocketFoundryClient | Login Failed: Unexpected status ${loginResponse.status}. Body preview: ${bodyPreview}`);
                    throw new Error(`Authentication Failed: Server returned status ${loginResponse.status}. Body: ${bodyPreview}`);
                }

                if (cookieMap.size > 0) {
                    logger.info(`SocketFoundryClient | Authentication successful for userId=${userId}. Cookies: ${Array.from(cookieMap.keys()).join(', ')}`);


                    try {
                        const gameResponse = await fetch(`${baseUrl}/game`, {
                            headers: {
                                'Cookie': Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
                                'User-Agent': 'SheetDelver/1.0'
                            },
                            redirect: 'manual'
                        });

                        logger.info(`SocketFoundryClient | /game fetch status: ${gameResponse.status}`);

                        if (gameResponse.status === 200) {
                            // Already parsed in /join
                        }

                        const gameCookies = gameResponse.headers.get('set-cookie');
                        if (gameCookies) {
                            logger.info(`SocketFoundryClient | /game set-cookie received.`);
                            addCookies(gameCookies);
                        }

                        const location = gameResponse.headers.get('location');
                        if (location && location.includes('/setup')) {
                            logger.error(`SocketFoundryClient | Redirected to /setup. Aborting.`);
                            throw new Error("Redirected to /setup. World might not be active or user unauthorized.");
                        }

                        this.sessionCookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
                        logger.info(`SocketFoundryClient | Final session cookies: ${Array.from(cookieMap.keys()).join(', ')}`);
                    } catch (ge: any) {
                        logger.error(`SocketFoundryClient | /game check failed: ${ge.message}`);
                        throw ge;
                    }

                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    logger.warn(`SocketFoundryClient | No session cookie received for ${userId}.`);
                }
            } catch (e: any) {
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
            logger.info(`SocketFoundryClient | DEBUG: Sending Cookie Header: "${headers.Cookie}"`);

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

            const ioOpts = (this.socket as any).io.opts;
            logger.info(`SocketFoundryClient | Final socket options: path=${ioOpts.path}, query=${JSON.stringify(ioOpts.query)}, auth=${JSON.stringify((this.socket as any).auth)}`);
            logger.info(`SocketFoundryClient | DEBUG: extraHeaders: ${JSON.stringify(ioOpts.extraHeaders)}`);
            logger.info(`SocketFoundryClient | DEBUG: transportOptions: ${JSON.stringify(ioOpts.transportOptions)}`);

            if (!this.socket) {
                return reject(new Error("Failed to initialize socket"));
            }

            const socket = this.socket;

            // Low-level diagnostics
            socket.on('connect', () => {
                logger.info('SocketFoundryClient | Connected to WebSocket. socket.id: ' + socket.id);
            });

            socket.on('disconnect', (reason) => {
                logger.warn('SocketFoundryClient | Socket disconnected. Reason: ' + reason);
                this.isSocketConnected = false;
                this.worldState = 'offline';
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
                if (process.env.NODE_ENV !== 'production') {
                    // Always log during join wait, then quiet down for userActivity
                    if (!this.isConnected || event !== 'userActivity') {
                        console.log(`>>> SOCKET EVENT: ${event}`, JSON.stringify(args).substring(0, 500));
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

                        if (!this.isConnected) {
                            this.isSocketConnected = true;
                            resolve();
                        }
                    } else {
                        logger.info(`SocketFoundryClient | Session event. Guest session (userId: null).`);

                        // If we had an explicit session and it was cleared by the server
                        if (this.isExplicitSession) {
                            logger.warn(`SocketFoundryClient | Explicit session lost (server-side). Forcing disconnect.`);
                            this.logout(); // This clears isExplicitSession and calls disconnect()
                        } else {
                            this.userId = null;
                            if (!this.isConnected) {
                                this.isSocketConnected = true;
                                resolve();
                            }
                        }
                    }
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
                    // If we see launchWorld progress, we are definitely moving out of setup.
                    if (data.action === 'launchWorld') {
                        if (this.isSetupMode) {
                            logger.info(`SocketFoundryClient | World launch detected (${data.pct}%). Clearing Setup Mode flag.`);
                            // Transition from 'setup' to 'offline' (intermediate) -> 'startup' (via status getter logic)
                            this.worldState = 'offline';
                            this.lastLaunchActivity = Date.now();
                            // Clear world cache when new world starts launching
                            this.worldCache.clear();
                        }

                        // When world launch completes, the world is ready!
                        // We don't always get a ready/init event if we're already connected
                        if (data.step === 'complete' && data.pct === 100) {
                            logger.info(`SocketFoundryClient | World launch complete. World is now ready.`);
                            this.worldState = 'active';
                            // NOTE: We intentionally do NOT clear lastLaunchActivity here.
                            // It needs to remain set for ~60s to protect against getSystem() timeouts
                            // during the transition period incorrectly inferring setup mode.

                            // For guest sessions AND logged in sessions, re-fetch /game to get the updated world title.
                            // The socket might not send the new title in the ready payload often enough.
                            logger.info(`SocketFoundryClient | Checking if should refresh world title. userId=${this.userId}, data.id=${data.id}`);

                            // Always refresh. It's cheap and ensures correctness after a switch.
                            this.refreshWorldTitleFromGame().catch(err => {
                                logger.warn(`SocketFoundryClient | Failed to refresh world title: ${err.message}`);
                            });
                        }
                    }
                }


                if (event === 'ready' || event === 'init') {
                    const payload = args[0] || {};
                    // World is ready, so setup mode is definitely over.
                    // World is ready, so setup mode is definitely over.
                    this.worldState = 'active';
                    this.lastLaunchActivity = 0; // Clear startup mode

                    const activeUserIds = payload.activeUsers || payload.userIds || [];
                    logger.info(`SocketFoundryClient | '${event}' payload keys: ${Object.keys(payload).join(', ')} | Active users: ${activeUserIds.length}`);
                    if (payload.users) {
                        logger.info(`SocketFoundryClient | Populating user map with ${payload.users.length} users from ready event.`);
                        payload.users.forEach((u: any, i: number) => {
                            const id = u._id || u.id;
                            const isActive = activeUserIds.includes(id) || u.active === true;
                            if (i < 3) logger.info(`SocketFoundryClient | User ${u.name} (${id}) | active: ${isActive} (doc active: ${u.active})`);
                            this.userMap.set(id, { ...u, active: isActive });
                        });
                    }

                    if (!this.isConnected) {
                        logger.info(`SocketFoundryClient | Received '${event}'. Connected.`);
                        this.isSocketConnected = true;
                        this.isJoining = false;
                        resolve();
                    }
                }

                // World Shutdown Detection
                if (event === 'shutdown') {
                    const data = args[0] || {};
                    logger.info(`SocketFoundryClient | World shutdown detected: ${data.world || 'unknown'}`);
                    // World has shut down, we're back in setup mode
                    this.worldState = 'setup';
                    this.lastLaunchActivity = 0;
                    // Clear world cache when world shuts down
                    this.worldCache.clear();
                    this.cachedWorldData = null; // Clear persistent cache Ref
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

                if (activeUserId === this.discoveredUserId && !this.isConnected && this.isJoining) {
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
        this.worldState = 'offline';
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

    /**
     * Re-fetch /game page to update world title from HTML.
     * This is needed for guest sessions where modifyDocument requests don't work.
     */
    private async refreshWorldTitleFromGame(): Promise<void> {
        try {
            logger.info(`SocketFoundryClient | Refreshing world title from /game...`);
            const gameUrl = `${this.url}/game`;
            const response = await fetch(gameUrl, {
                headers: {
                    'Cookie': this.sessionCookie || '',
                    'User-Agent': 'SheetDelver/1.0'
                },
                redirect: 'follow' // Follow redirects to get the actual HTML page
            });

            logger.info(`SocketFoundryClient | /game fetch status: ${response.status}, final URL: ${response.url}`);

            // Detect redirect to setup page
            if (response.url.includes('/setup')) {
                logger.info(`SocketFoundryClient | /game redirected to /setup. World is NOT active.`);
                this.worldState = 'setup';
                this.worldTitleFromHtml = null;
                this.cachedWorldData = null;
                return;
            }

            const html = await response.text();

            // Parse world title from HTML
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch) {
                let rawTitle = titleMatch[1].trim();
                rawTitle = rawTitle.replace(/^Foundry Virtual Tabletop [•·\-|]\s*/i, '');

                // Final check: If the title is "Foundry Virtual Tabletop", we are likely on the setup page
                // even if the URL check somehow failed.
                if (rawTitle === 'Foundry Virtual Tabletop' || rawTitle === 'World Selection') {
                    logger.info(`SocketFoundryClient | Generic title detected. Assuming setup mode.`);
                    this.worldState = 'setup';
                    this.worldTitleFromHtml = null;
                    return;
                }

                this.worldTitleFromHtml = rawTitle;
                logger.info(`SocketFoundryClient | Refreshed world title: "${this.worldTitleFromHtml}"`);

                // Update the cache with the new title
                const cached = this.worldCache.get(this.url) || {};
                this.worldCache.set(this.url, { ...cached, worldTitle: this.worldTitleFromHtml });

                // If we successfully fetched /game, the world is active!
                if (this.worldState !== 'active') {
                    logger.info(`SocketFoundryClient | Title refresh confirmed world is active.`);
                    this.worldState = 'active';
                }
            } else {
                logger.warn(`SocketFoundryClient | Could not find <title> tag in /game response`);
            }
        } catch (error: any) {
            logger.warn(`SocketFoundryClient | Failed to refresh world title: ${error.message}`);
        }
    }

    async getSystem(): Promise<SystemConnectionData> {
        // 1. Primary State Check
        if (this.worldState === 'setup') {
            return {
                id: 'setup',
                title: 'Foundry Setup',
                version: '0.0.0',
                isLoggedIn: false,
                isAuthenticating: false,
                status: 'setup'
            };
        }

        if (this.isAuthenticating) {
            return {
                id: 'unknown',
                title: 'Unknown System',
                version: '0.0.0',
                isLoggedIn: this.isLoggedIn,
                isAuthenticating: true,
                status: this.status
            };
        }

        // 2. Connection Check
        // If socket is disconnected, we report it.
        if (!this.isSocketConnected) {
            return {
                id: 'unknown',
                title: 'Reconnecting...',
                version: '0.0.0',
                isLoggedIn: this.isLoggedIn,
                isAuthenticating: false,
                status: this.status
            };
        }

        const cached = this.worldCache.get(this.url) || {};

        const sysData: SystemConnectionData = {
            id: cached.id || 'shadowdark', // Default fallback
            title: cached.title || 'Shadowdark RPG',
            version: cached.version || '1.0.0',
            worldTitle: this.worldTitleFromHtml || cached.worldTitle || 'Foundry World',
            worldDescription: cached.worldDescription || '',
            worldBackground: this.worldBackgroundFromHtml || cached.worldBackground || `${this.url}/ui/denim075.png`,
            isLoggedIn: this.isLoggedIn,
            isAuthenticating: this.isAuthenticating,
            users: { active: 0, total: 0 },
            status: this.status
        };

        try {
            // 3. Fetch System Data (if ready/active)
            // If we are in the startup window, try with a short timeout to see if it's already up
            const socketTimeout = this.status === 'startup' ? 1000 : 5000;

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
                if (sysResponse?.result?.[0]?.value) {
                    sysData.id = sysResponse.result[0].value;
                    this.worldCache.set(this.url, { ...this.worldCache.get(this.url), id: sysData.id });

                    // Confirmation of system data means world is definitely active
                    if (this.worldState !== 'active') {
                        logger.info(`SocketFoundryClient | Socket responsiveness confirmed world is active.`);
                        this.worldState = 'active';
                        this.lastLaunchActivity = 0;
                    }
                }
            }

            // 4. Fetch Users
            try {
                let users = Array.from(this.userMap.values());
                if (users.length === 0) {
                    users = await this.getUsers(false).catch(() => []);
                }

                // FALLBACK: If live users are still empty, use cached data
                if (users.length === 0 && this.cachedWorldData?.users) {
                    logger.debug(`SocketFoundryClient | Live user list empty. Falling back to cache.`);
                    users = this.cachedWorldData.users;
                }

                if (users && users.length > 0) {
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
                                logger.error(`SocketFoundryClient | User definitively inactive/kicked. Forcing logout.`);
                                this.logout();
                                sysData.isLoggedIn = false;
                                this.validationFailCount = 0;
                            }
                        } else {
                            this.validationFailCount = 0;
                        }
                    } else {
                        this.validationFailCount = 0;
                    }
                    sysData.users = {
                        active: activeUsers.length,
                        total: users.length,
                        list: users
                    };
                }
            } catch (ue) {
                // User fetch failed
            }

            return sysData;

        } catch (e: any) {
            // 5. Timeout / Failure Handling
            // If we time out on a guest session, it's a strong indicator of Setup Mode
            // because the Setup page does not respond to socket requests like 'Setting'.
            if (e.message && e.message.includes('Timeout') && !this.userId) {
                // Protection: If we recently launched the world, ignore timeout
                if (Date.now() - this.lastLaunchActivity < this.STARTUP_WINDOW_MS) {
                    logger.info('SocketFoundryClient | Timeout on guest session, but world launch detected recently. Ignoring Setup inference.');
                } else {
                    logger.info('SocketFoundryClient | Timeout on guest session. Inferring "Setup" mode.');
                    this.worldState = 'setup';
                    return {
                        id: 'setup',
                        title: 'Foundry Setup',
                        version: '0.0.0',
                        isLoggedIn: false,
                        isAuthenticating: false,
                        status: 'setup'
                    };
                }
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


}
