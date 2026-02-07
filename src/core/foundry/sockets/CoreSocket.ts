
import { io, Socket } from 'socket.io-client';
import { SocketBase } from './SocketBase';
import { logger } from '../../logger';
import { WorldData, CacheData, SetupScraper } from '../SetupScraper';
import { FoundryConfig } from '../types';
import { FoundryMetadataClient } from '../interfaces';
import { getAdapter } from '../../../modules/core/registry';
import { SystemAdapter } from '../../../modules/core/interfaces';
import { CompendiumCache } from '../compendium-cache';
const isBrowser = typeof window !== 'undefined';
let fs: any = null;
let path: any = null;

async function loadDeps() {
    if (isBrowser) return false;
    if (fs && path) return true;
    try {
        const fsMod = await import('node:fs');
        const pathMod = await import('node:path');
        fs = fsMod.default || fsMod;
        path = pathMod.default || pathMod;
        return true;
    } catch (e) {
        return false;
    }
}

export class CoreSocket extends SocketBase implements FoundryMetadataClient {
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

    public async getPackIndex(packId: string, type: string): Promise<any[]> {
        try {
            logger.debug(`CoreSocket | Fetching index for pack ${packId} (type: ${type})...`);

            // Try 1: getCompendiumIndex (v12/v13)
            // String payload is the preferred v13 way
            try {
                const response: any = await this.emitSocketEvent('getCompendiumIndex', packId, 3000);
                if (Array.isArray(response)) {
                    return response;
                }
                if (response?.result && Array.isArray(response.result)) {
                    return response.result;
                }
            } catch (e) {
                // Silently fallback
            }

            // Try 2: getDocuments (v13 Standard)
            // Try both singular and plural (v13 often prefers plural collection names)
            const typesToTry = [type];
            if (type === 'RollTable') typesToTry.push('Tables', 'RollTables');
            else if (type === 'Item') typesToTry.push('Items');
            else if (type === 'JournalEntry') typesToTry.push('Journal');

            for (const t of typesToTry) {
                try {
                    const response: any = await this.emitSocketEvent('getDocuments', {
                        type: t,
                        operation: { pack: packId, index: true }
                    }, 2000);
                    if (response?.result && Array.isArray(response.result)) {
                        return response.result;
                    }
                } catch (e) {
                    // Try next type
                }
            }

            // Fallback: modifyDocument (Legacy)
            try {
                const response: any = await this.dispatchDocumentSocket(type, 'get', {
                    pack: packId,
                    index: true,
                    broadcast: false
                }, undefined, false); // Do not fail hard on this
                const finalIndex = response?.result || [];
                if (finalIndex.length > 0) {
                    return finalIndex;
                }
            } catch (e: any) {
                // Ignore packData errors
            }

            return [];
        } catch (e) {
            logger.warn(`CoreSocket | getPackIndex failed for ${packId}: ${e}`);
            return [];
        }
    }

    public async getAllCompendiumIndices(): Promise<any[]> {
        if (!this.isConnected) return [];
        if (this.gameDataCache?.indices) return this.gameDataCache.indices; // Return cached if already available

        // Deduplication Guard
        const { CompendiumCache } = await import('../compendium-cache');
        if (CompendiumCache.getInstance().hasLoaded()) {
            // We still want to return the indices if they exist
            // But we need to make sure they are stored in gameDataCache or we re-fetch once and store.
            // For now, let's just let it run if not loaded, but we should eventually skip if already warming up.
        }

        try {
            const game = this.gameDataCache || await this.fetchGameData();
            if (!game) {
                logger.warn('CoreSocket | No gameData available for discovery.');
                return [];
            }
            logger.debug(`CoreSocket | gameData keys: ${Object.keys(game).join(', ')}`);
            if (game.packs) logger.debug(`CoreSocket | game.packs found, count: ${game.packs.length}`);

            const packs = new Map<string, any>();

            // 0. Top-level Packs (v13 prefers this)
            // Use this as the definitive list of IDs
            if (Array.isArray(game.packs)) {
                game.packs.forEach((p: any) => {
                    const id = p.id || p._id;
                    if (id) packs.set(id, { ...p, source: 'game.packs' });
                });
            }

            // 1. Fallback Discovery (Aggregate from metadata if top-level packs missing)
            const fallbackPacks = [
                ...(game.world?.packs || []).map((p: any) => ({ ...p, source: 'world' })),
                ...(game.system?.packs || []).map((p: any) => ({ ...p, source: 'system' })),
                ...(game.modules || []).flatMap((m: any) => (m.packs || []).map((p: any) => ({ ...p, source: 'module', moduleId: m.id })))
            ];

            fallbackPacks.forEach((p: any) => {
                const id = p.id || p._id || (p.moduleId ? `${p.moduleId}.${p.name}` : `${game.system.id}.${p.name}`);
                if (!packs.has(id)) packs.set(id, p);
            });

            logger.info(`CoreSocket | Discovering indices for ${packs.size} packs in parallel...`);
            const results = await Promise.all(Array.from(packs.entries()).map(async ([packId, metadata]) => {
                const docType = metadata.type || metadata.entity || metadata.documentName || 'Item';
                const index = await this.getPackIndex(packId, docType);
                return {
                    id: packId,
                    metadata: metadata,
                    index: index
                };
            }));

            logger.info(`CoreSocket | Compendium discovery complete (${results.length} packs indexed)`);
            if (this.gameDataCache) this.gameDataCache.indices = results;
            return results;
        } catch (e) {
            logger.warn(`CoreSocket | getAllCompendiumIndices failed: ${e}`);
            return [];
        }
    }

    // --- Public API methods (called by Endpoints) ---

    public getGameData() { return this.gameDataCache; }
    public getSystemAdapter() { return this.adapter; }

    public async getSystemConfig(): Promise<any> {
        // Return from cache if available
        if (this.gameDataCache?.system) {
            return this.gameDataCache.system;
        }

        // Otherwise, probe for it
        if (!this.socket || !this.socket.connected) return null;

        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(null), 5000);
            this.socket!.emit('getSystemConfig', (config: any) => {
                clearTimeout(t);
                resolve(config);
            });
        });
    }

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
            return await this.adapter.normalizeActorData(data, this);
        }
        return data;
    }

    public async getActorRaw(id: string): Promise<any> {
        const response: any = await this.dispatchDocumentSocket('Actor', 'get', { query: { _id: id }, broadcast: false });
        return response?.result?.[0];
    }

    public async fetchByUuid(uuid: string): Promise<any> {
        if (!uuid || typeof uuid !== 'string') return null;

        // 1. World Document (e.g. Actor.ID, Item.ID)
        if (!uuid.startsWith('Compendium.')) {
            const [type, id] = uuid.split('.');
            if (type && id) {
                const response = await this.dispatchDocumentSocket(type, 'get', { query: { _id: id }, broadcast: false });
                return response?.result?.[0];
            }
            return null;
        }

        // 2. Compendium Document (e.g. Compendium.pack.Type.ID)
        const parts = uuid.split('.');
        if (parts.length < 4) return null;

        const packId = `${parts[1]}.${parts[2]}`;
        const type = parts[3];
        const id = parts[4];

        try {
            const response: any = await this.emitSocketEvent('getDocuments', {
                type: type,
                operation: { pack: packId, query: { _id: id } }
            }, 3000);

            if (response?.result && Array.isArray(response.result)) {
                return response.result[0];
            }
        } catch (e) {
            // Fallback for RollTables or other specific v13 behaviors
            try {
                const response = await this.dispatchDocumentSocket(type, 'get', {
                    pack: packId,
                    query: { _id: id },
                    broadcast: false
                }, undefined, false);
                return response?.result?.[0];
            } catch (inner) {
                logger.warn(`CoreSocket | fetchByUuid failed for ${uuid}: ${inner}`);
            }
        }

        return null;
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

    async dispatchDocument(type: string, action: string, operation?: any, parent?: { type: string, id: string }): Promise<any> {
        return await this.dispatchDocumentSocket(type, action, operation, parent);
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

    async useItem(actorId: string, itemId: string): Promise<any> {
        const actor = await this.getActor(actorId);
        const item = actor.items?.find((i: any) => i._id === itemId || i.id === itemId);
        if (!item) return false;
        await this.sendMessage(`<b>${actor.name}</b> uses <b>${item.name}</b>`, this.userId || undefined);
        return true;
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

    async evaluate<T>(): Promise<T> {
        return this.gameDataCache as any;
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
