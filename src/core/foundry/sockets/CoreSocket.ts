
import { io, Socket } from 'socket.io-client';
import { SocketBase } from './SocketBase';
import { logger } from '../../logger';
import { WorldData, CacheData, SetupScraper } from '../SetupScraper';
import { FoundryConfig } from '../types';
import { getAdapter } from '../../../modules/core/registry';
import { SystemAdapter } from '../../../modules/core/interfaces';
import { CompendiumCache } from '../compendium-cache';
import path from 'path';
import fs from 'fs';

export class CoreSocket extends SocketBase {
    public worldState: 'offline' | 'setup' | 'active' = 'offline';
    public cachedWorldData: WorldData | null = null;
    public cachedWorlds: Record<string, WorldData> = {};
    private adapter: SystemAdapter | null = null;
    private gameDataCache: any = null;
    public userId: string | null = null;

    // Core Socket maintains the singular connection
    private consecutiveFailures = 0;
    private lastLaunchActivity = 0;
    private userMap = new Map<string, any>();
    private actorCache = new Map<string, string>();


    constructor(config: any) {
        super(config);
        this.loadInitialCache();
    }

    private async loadInitialCache() {
        try {
            const cache = await SetupScraper.loadCache();
            this.cachedWorlds = cache.worlds || {};
            if (cache.currentWorldId && this.cachedWorlds[cache.currentWorldId]) {
                this.cachedWorldData = this.cachedWorlds[cache.currentWorldId];
            }
        } catch (e) {
            logger.warn('CoreSocket | Failed to load initial cache: ' + e);
        }
    }

    /**
     * Get the current World status upon initial connection.
     */
    private async getWorldStatus(): Promise<boolean> {
        if (!this.socket || !this.socket.connected) return false;
        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(false), 5000);
            this.socket!.emit('getWorldStatus', (status: boolean) => {
                clearTimeout(t);
                resolve(status);
            });
        });
    }

    /**
     * Request World data from server and return it.
     */
    private async getWorldData(): Promise<any> {
        if (!this.socket || !this.socket.connected) return null;
        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(null), 10000);
            this.socket!.emit('world', (data: any) => {
                clearTimeout(t);
                resolve(data);
            });
        });
    }

    async connect(): Promise<void> {
        if (this.isConnected) return;
        const baseUrl = this.getBaseUrl();
        logger.info(`CoreSocket | Connecting to ${baseUrl}...`);

        try {
            // 1. Handshake & CSRF & Scraped Users
            const { csrfToken, isSetupMatch, users: scrapedUsers } = await this.performHandshake(baseUrl);
            if (isSetupMatch) {
                logger.info('CoreSocket | Detected Setup Mode. World is closed.');
                this.worldState = 'setup';
                return;
            }

            // 2. Discovery (Guest Probe)
            logger.info('CoreSocket | Probing world state (Guest Socket)...');
            const joinData = await this.probeWorldState(baseUrl);

            if (joinData && joinData.world) {
                logger.info(`CoreSocket | Discovered world "${joinData.world.title}" via Probe.`);
                this.worldState = 'active';
                // Update Cache and User Map
                if (joinData.users) {
                    joinData.users.forEach((u: any) => this.userMap.set(u._id, u));
                }
            } else if (scrapedUsers.length > 0) {
                logger.info(`CoreSocket | Probe failed, but found ${scrapedUsers.length} users via Scraping.`);
                this.worldState = 'active'; // Assume active if we have users
                scrapedUsers.forEach((u: any) => this.userMap.set(u._id, u));
            } else {
                logger.warn('CoreSocket | Discovery failed completely. No world data or users found.');
                this.worldState = 'offline';
                return;
            }

            // Identify Service Account ID (Resolve ID from username)
            if (this.config.username) {
                const user = Array.from(this.userMap.values()).find((u: any) => u.name === this.config.username);
                if (user) {
                    this.userId = user._id;
                    logger.info(`CoreSocket | Resolved Service Account ID: ${this.userId} (Username: ${this.config.username})`);
                } else {
                    logger.warn(`CoreSocket | Could not resolve User ID for ${this.config.username}`);
                }
            }

            // 3. Login Service Account
            if (this.userId) {
                // Ensure we have the latest CSRF from cookie if scrape missed it
                const finalCsrf = csrfToken || this.cookieMap.get('csrf-token') || this.cookieMap.get('xsrf-token') || null;
                await this.performLogin(baseUrl, this.userId, finalCsrf);
            } else {
                logger.warn('CoreSocket | No User ID resolved, skipping explicit POST login step.');
            }

            // 4. Connect Main Socket
            const sessionId = this.getSessionId();
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 15000);

                this.socket = io(baseUrl, {
                    path: '/socket.io',
                    transports: ['websocket'],
                    upgrade: false,
                    reconnection: true,
                    query: sessionId ? { session: sessionId } : {},
                    auth: sessionId ? { session: sessionId } : {},
                    extraHeaders: {
                        'Cookie': this.sessionCookie || '',
                        'User-Agent': 'SheetDelver/1.0'
                    },
                    transportOptions: {
                        websocket: {
                            extraHeaders: {
                                'Cookie': this.sessionCookie || '',
                                'User-Agent': 'SheetDelver/1.0'
                            }
                        }
                    }
                });

                this.socket.on('connect', async () => {
                    logger.info(`CoreSocket | Main Socket Transport Connected. socket.id: ${this.socket?.id}`);
                    this.isSocketConnected = true;
                    this.setupSharedContentListeners(this.socket!);

                    // 5. Verify World Status
                    const isActive = await this.getWorldStatus();
                    if (!isActive) {
                        logger.warn('CoreSocket | Socket connected but world is NOT active.');
                        this.worldState = 'setup';
                        clearTimeout(timeout);
                        this.emit('connect');
                        resolve();
                        return;
                    }

                    logger.info('CoreSocket | World is ACTIVE. Fetching game data via socket...');
                    this.worldState = 'active';

                    // 6. Fetch Game Data via Socket (The canonical bootstrap way)
                    const gameData = await this.getWorldData();
                    if (gameData) {
                        this.gameDataCache = gameData;
                        if (gameData.users) {
                            const activeIds = gameData.activeUsers || [];
                            gameData.users.forEach((u: any) => {
                                const isActive = activeIds.includes(u._id || u.id);
                                const userData = { ...u, active: isActive };
                                this.userMap.set(u._id || u.id, userData);
                            });
                            // Sync the cache array as well
                            gameData.users = gameData.users.map((u: any) => ({
                                ...u,
                                active: activeIds.includes(u._id || u.id)
                            }));
                        }
                        if (gameData.userId) {
                            this.userId = gameData.userId;
                        }

                        const systemId = gameData.system?.id || gameData.system?.name;
                        if (systemId) {
                            await this.loadSystemAdapter(systemId);
                        }
                        logger.info(`CoreSocket | Game Data Loaded via Socket (User: ${this.userId})`);
                    } else {
                        logger.warn('CoreSocket | Failed to fetch game data via socket. Falling back to /game parsing.');
                        this.fetchGameData().catch(e => logger.warn(`CoreSocket | Fallback gameData fetch failed: ${e}`));
                    }

                    clearTimeout(timeout);
                    this.emit('connect');
                    resolve();
                });

                this.socket.on('disconnect', (reason: string) => {
                    logger.info(`CoreSocket | Socket Disconnected: ${reason}`);
                    this.isSocketConnected = false;
                    this.emit('disconnect', reason);
                });

                this.socket.on('connect_error', (err) => {
                    logger.error(`CoreSocket | Socket connection error: ${err.message}`);
                    clearTimeout(timeout);
                    reject(err);
                });

                this.socket.on('session', (data: any) => {
                    if (data && data.userId && !this.userId) {
                        logger.info(`CoreSocket | Acquired User ID from session event: ${data.userId}`);
                        this.userId = data.userId;
                    }
                });

                // User Presence & Activity Listeners
                this.socket.on('userConnected', (user: any) => {
                    const id = user._id || user.id;
                    logger.info(`CoreSocket | User connected: ${user.name} (${id})`);
                    this.updateUserInCache(id, { ...user, active: true });
                });

                this.socket.on('userDisconnected', (data: any) => {
                    const id = typeof data === 'string' ? data : (data.userId || data._id || data.id);
                    logger.info(`CoreSocket | User disconnected: ${id}`);
                    this.updateUserInCache(id, { active: false });
                });

                this.socket.on('userActivity', (userId: string, data: any) => {
                    if (userId && data) {
                        const isActive = data.active !== false;
                        this.updateUserInCache(userId, { active: isActive });
                    }
                });

                this.socket.on('modifyDocument', (data: any) => {
                    if (data.type === 'User' && (data.action === 'update' || data.action === 'create')) {
                        const users = data.result || [];
                        users.forEach((u: any) => {
                            const id = u._id || u.id;
                            if (id) {
                                this.updateUserInCache(id, u);
                            }
                        });
                    }
                });

                // Legacy/Module Compatibility Listeners
                this.socket.on('createUser', (user: any) => this.updateUserInCache(user._id || user.id, user));
                this.socket.on('updateUser', (user: any) => this.updateUserInCache(user._id || user.id, user));
                this.socket.on('deleteUser', (id: string | any) => {
                    const userId = typeof id === 'string' ? id : (id._id || id.id);
                    logger.info(`CoreSocket | User deleted: ${userId}`);
                    this.userMap.delete(userId);
                    if (this.gameDataCache && Array.isArray(this.gameDataCache.users)) {
                        this.gameDataCache.users = this.gameDataCache.users.filter((u: any) => (u._id !== userId && u.id !== userId));
                    }
                });
            });

        } catch (e: any) {
            logger.error(`CoreSocket | Connection flow failed: ${e.message}`);
            this.worldState = 'offline';
            throw e;
        }
    }

    async fetchGameData(): Promise<any> {
        if (this.gameDataCache) return this.gameDataCache;

        logger.debug('CoreSocket | Fetching Game Data... Cookie present: ' + !!this.sessionCookie);
        const baseUrl = this.getBaseUrl();
        try {
            const response = await fetch(`${baseUrl}/game`, {
                headers: {
                    'Cookie': this.sessionCookie || '',
                    'User-Agent': 'SheetDelver/1.0'
                }
            });

            if (!response.ok) throw new Error(`Failed to fetch /game: ${response.status}`);
            const html = await response.text();
            // logger.debug(`CoreSocket | Fetched /game (${html.length} bytes). Parsing...`);

            const parseMatch = html.match(/const gameData = JSON\.parse\('(.*?)'\);/);
            if (parseMatch) {
                try {
                    this.gameDataCache = JSON.parse(parseMatch[1].replace(/\\'/g, "'"));
                    logger.info('CoreSocket | Successfully parsed JSON.parse gameData.');
                } catch (e) {
                    logger.warn(`CoreSocket | Parse failed: ${e}`);
                }
            }

            if (!this.gameDataCache) {
                const literalMatch = html.match(/const gameData = ({[\s\S]*?});\s*$/m);
                if (literalMatch) {
                    this.gameDataCache = JSON.parse(literalMatch[1]);
                    logger.info('CoreSocket | Successfully parsed literal gameData.');
                }
            }

            if (!this.gameDataCache) {
                logger.warn('CoreSocket | Could not extract gameData from HTML.');
                // Log a snippet of HTML for debugging (Info level explicitly)
                logger.info(`CoreSocket | HTML Snippet (First 500chars): ${html.substring(0, 500)}`);
            }

            if (this.gameDataCache) {
                const systemId = this.gameDataCache.system?.id || this.gameDataCache.system?.name;
                logger.info(`CoreSocket | Extracted system ID: ${systemId}`);

                if (systemId) {
                    await this.loadSystemAdapter(systemId);
                }

                // Populate Users
                if (this.gameDataCache.users) {
                    this.gameDataCache.users.forEach((u: any) => this.userMap.set(u._id, u));
                }

                logger.info(`CoreSocket | Game Data Loaded (System: ${systemId})`);
                return this.gameDataCache;
            }
        } catch (e) {
            logger.error(`CoreSocket | Failed to fetch gameData via /game: ${e}`);
        }
        return null;
    }

    // --- Socket Actions ---

    // Rename to avoid conflict with EventEmitter
    public async emitSocketEvent<T>(event: string, payload: any, timeoutMs: number = 5000): Promise<T> {
        if (!this.socket || !this.isConnected) throw new Error(`Not connected to Foundry`);

        return new Promise((resolve, reject) => {
            this.socket!.emit(event, payload, (response: any) => {
                if (response?.error) {
                    reject(new Error(typeof response.error === 'string' ? response.error : JSON.stringify(response.error)));
                } else {
                    resolve(response);
                }
            });
            setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), timeoutMs);
        });
    }

    public async dispatchDocumentSocket(type: string, action: string, operation: any = {}, parent?: { type: string, id: string }, failHard: boolean = true): Promise<any> {
        if (!this.socket?.connected) throw new Error('Socket not connected');
        operation.action = action;
        if (parent) operation.parentUuid = `${parent.type}.${parent.id}`;

        try {
            const result = await this.emitSocketEvent('modifyDocument', { type, action, operation }, 5000);
            this.consecutiveFailures = 0;
            return result;
        } catch (error: any) {
            if (failHard) this.consecutiveFailures++;
            throw error;
        }
    }

    // --- Public API methods (called by Endpoints) ---

    public getGameData() { return this.gameDataCache; }
    public getSystemAdapter() { return this.adapter; }
    public get url() { return this.config.url; }

    public async loadSystemAdapter(systemId: string) {
        try {
            const adapter = getAdapter(systemId);
            if (adapter) {
                this.adapter = adapter;
                logger.info(`CoreSocket | Loaded System Adapter: ${systemId}`);
            }
        } catch (e) {
            logger.error(`CoreSocket | Failed load adapter: ${e}`);
        }
    }

    public async getJournals(userId?: string): Promise<any[]> {
        const result: any = await this.dispatchDocumentSocket('JournalEntry', 'get', { broadcast: false });
        const all = result?.result || [];
        if (!userId) return all;

        // Basic filtering for implicit User View
        // 0 = None, 1 = Limited, 2 = Observer, 3 = Owner
        // If no ownership[userId], check ownership['default']
        return all.filter((j: any) => {
            const level = j.ownership?.[userId] !== undefined ? j.ownership[userId] : (j.ownership?.default || 0);
            return level >= 1; // Limited or better
        });
    }

    public async getActors(userId?: string): Promise<any[]> {
        const result: any = await this.dispatchDocumentSocket('Actor', 'get', { broadcast: false });
        const all = result?.result || [];
        if (!userId) return all;

        return all.filter((a: any) => {
            const level = a.ownership?.[userId] !== undefined ? a.ownership[userId] : (a.ownership?.default || 0);
            return level >= 1;
        });
    }

    public async getActor(id: string, forceSystemId?: string): Promise<any> {
        // CoreSocket returns the actor. Caller handles permissions if needed or we trust internal logic.
        const response: any = await this.dispatchDocumentSocket('Actor', 'get', { query: { _id: id }, broadcast: false });
        // Normalize
        const data = response?.result?.[0];
        if (data && this.adapter) {
            return await this.adapter.normalizeActorData(data);
        }
        return data;
    }

    public async getChatLog(limit = 100, userId?: string): Promise<any[]> {
        const response: any = await this.dispatchDocumentSocket('ChatMessage', 'get', { broadcast: false });
        let raw = (response?.result || []).slice(-limit).reverse();

        if (userId) {
            raw = raw.filter((m: any) => {
                // Chat permissions logic is complex (whispers etc)
                // For now, if whisper exists, check if user is in it or is author
                if (m.whisper && m.whisper.length > 0) {
                    return m.whisper.includes(userId) || m.author === userId;
                }
                return true; // Public message
            });
        }

        return raw.map((msg: any) => ({
            ...msg,
            user: this.userMap.get(msg.author)?.name || msg.alias || 'Unknown',
            timestamp: msg.timestamp || Date.now(),
            isRoll: msg.type === 5,
            rollTotal: msg.rolls?.[0]?.total,
            flavor: msg.flavor
        }));
    }

    public async sendMessage(content: string | any, userId?: string): Promise<any> {
        // If userId is provided, we try to create the message AS that user.
        // Since we are GM/Service, we can set 'author' to any user ID.
        const auth = userId || this.userId;
        if (!auth) throw new Error("Cannot send message: Author ID missing");

        const data = typeof content === 'string'
            ? { content, type: 1, author: auth }
            : { type: 1, author: auth, ...content };

        return await this.dispatchDocumentSocket('ChatMessage', 'create', { data: [data] });
    }

    public async roll(formula: string, flavor?: string, userId?: string): Promise<any> {
        return await this.sendMessage(`Rolling ${formula}: ${flavor || ''}`, userId);
    }

    // Admin / World Control
    public async launchWorld(worldId: string) { /* ... */ }
    public async shutdownWorld() { /* ... */ }

    public async getSystem(): Promise<any> {
        return this.gameDataCache?.system || {};
    }

    public async getUsers(failHard: boolean = false): Promise<any[]> {
        const response: any = await this.dispatchDocumentSocket('User', 'get', { broadcast: false }, undefined, failHard);
        return response?.result || [];
    }

    /**
     * Internal helper to keep userMap and gameDataCache in sync with real-time events.
     */
    private updateUserInCache(userId: string, data: Partial<any>) {
        const existing = this.userMap.get(userId);
        const updated = existing ? { ...existing, ...data } : { _id: userId, ...data };

        // Update User Map
        this.userMap.set(userId, updated);

        // Update gameDataCache for Status Handler
        if (this.gameDataCache && Array.isArray(this.gameDataCache.users)) {
            const index = this.gameDataCache.users.findIndex((u: any) => (u._id === userId || u.id === userId));
            if (index !== -1) {
                this.gameDataCache.users[index] = { ...this.gameDataCache.users[index], ...data };
            } else {
                this.gameDataCache.users.push(updated);
            }
        }

        // If user was unknown but became active, try healing data
        if (!existing && data.active === true && !data.name) {
            this.getUsers().then(dbUsers => {
                const fullUser = dbUsers.find((u: any) => (u._id === userId || u.id === userId));
                if (fullUser) {
                    this.updateUserInCache(userId, fullUser);
                    logger.debug(`CoreSocket | Self-healed user data for ${fullUser.name}`);
                }
            }).catch(() => { });
        }
    }
}
