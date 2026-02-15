
import { io, Socket } from 'socket.io-client';
import { SocketBase } from './SocketBase';
import { logger } from '../../logger';
import { WorldData, CacheData, SetupManager } from '../SetupManager';
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
    public worldState: 'offline' | 'setup' | 'startup' | 'active' = 'offline';
    public cachedWorldData: WorldData | null = null;
    public cachedWorlds: Record<string, WorldData> = {};
    private adapter: SystemAdapter | null = null;
    public gameDataCache: any = null;
    public userId: string | null = null;
    public lastActorChange: number = Date.now();

    // Core Socket maintains the singular connection
    private consecutiveFailures = 0;
    private lastLaunchActivity = 0;
    private userMap = new Map<string, any>();
    private actorDataCache = new Map<string, any>();

    private _deepMerge(target: any, source: any) {
        if (!source || typeof source !== 'object') return target;
        if (!target || typeof target !== 'object') return source;

        for (const [key, value] of Object.entries(source)) {
            // Handle Case: Flattened Keys (e.g. "system.details.patron")
            if (key.includes('.')) {
                const parts = key.split('.');
                let current = target;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (!current[part] || typeof current[part] !== 'object') {
                        current[part] = {};
                    }
                    current = current[part];
                }
                const lastPart = parts[parts.length - 1];
                logger.debug(`CoreSocket | DeepMerge Dotted: ${key} -> ${JSON.stringify(value)}`);
                current[lastPart] = value;
                continue;
            }

            // Standard Nested Merge
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this._deepMerge(target[key], value);
            } else {
                logger.debug(`CoreSocket | DeepMerge Set: ${key} -> ${JSON.stringify(value)}`);
                target[key] = value;
            }
        }
        return target;
    }

    private _updateActorCache(type: string, action: string, result: any, operation?: any) {
        if (!result && action !== 'delete') return;

        if (type === 'Actor') {
            this.lastActorChange = Date.now();
            const docs = Array.isArray(result) ? result : [result];
            if (action === 'delete') {
                const ids = operation?.ids || docs.map((d: any) => d?._id || d?.id).filter(Boolean);
                ids.forEach((id: string) => this.actorDataCache.delete(id));
            } else {
                docs.forEach((actor: any) => {
                    const id = actor?._id || actor?.id;
                    if (id) {
                        const existing = this.actorDataCache.get(id);
                        if (existing && action === 'update') {
                            logger.debug(`CoreSocket | Updating cached actor ${id} (${type} ${action}) with diff: ${JSON.stringify(actor)}`);
                            this._deepMerge(existing, actor);
                            this.actorDataCache.set(id, existing);
                        } else if (action === 'update') {
                            // Partial update on a cache miss: Delete to force fresh fetch on next GET
                            logger.debug(`CoreSocket | Cache miss on update for actor ${id}, invalidating...`);
                            this.actorDataCache.delete(id);
                        } else {
                            // Create or get: Full object
                            logger.debug(`CoreSocket | Setting new cached actor ${id} (${type} ${action})`);
                            this.actorDataCache.set(id, actor);
                        }
                    }
                });
            }
        } else if (type === 'Item') {
            // Resolve parent Actor ID
            let actorId = operation?.parentId;
            if (!actorId && operation?.parentUuid) {
                const parts = operation.parentUuid.split('.');
                // Format could be 'Actor.ID' or 'Actor.ID.Item.ID'
                if (parts[0] === 'Actor') actorId = parts[1];
            }

            if (!actorId) return;

            const actor = this.actorDataCache.get(actorId);
            if (!actor) return;

            const docs = Array.isArray(result) ? result : [result];
            if (!actor.items) actor.items = [];

            if (action === 'delete') {
                const ids = operation.ids || docs.map((d: any) => d?._id || d?.id).filter(Boolean);
                actor.items = actor.items.filter((i: any) => !ids.includes(i._id || i.id));
            } else if (action === 'update') {
                docs.forEach((item: any) => {
                    const itemId = item?._id || item?.id;
                    const idx = actor.items.findIndex((i: any) => (i._id || i.id) === itemId);
                    if (idx !== -1) {
                        this._deepMerge(actor.items[idx], item);
                    }
                });
            } else if (action === 'create') {
                actor.items.push(...docs);
            }
            this.actorDataCache.set(actorId, actor);
        }
    }


    constructor(config: any) {
        super(config);
        this.loadInitialCache();
    }

    private async loadInitialCache() {
        try {
            const cache = await SetupManager.loadCache();
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

    private isConnecting = false;

    private heartbeatInterval: NodeJS.Timeout | null = null;

    private startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        // Check every 15s
        this.heartbeatInterval = setInterval(async () => {
            if (!this.isConnected) return;
            try {
                const { isSetupMatch, csrfToken, users, pageTitle } = await this.performHandshake(this.getBaseUrl());

                const isGenericOrErrorTitle = !pageTitle || pageTitle === 'Foundry Virtual Tabletop' || pageTitle.includes('Critical Failure');

                // Detection: True Setup OR Gray State (No CSRF & No Users on /join AND Generic Title)
                if (isSetupMatch || ((!csrfToken && users.length === 0) && isGenericOrErrorTitle)) {
                    logger.warn(`CoreSocket | Heartbeat detected transition to Setup/Gray State (Title="${pageTitle}"). Restarting connection flow...`);
                    this.worldState = 'setup';
                    this.disconnect(); // Close socket
                    this.connect();    // Restart loop (which will handle setup polling)
                }
            } catch (e) {
                // Network blip? Ignore or count failures?
                // For now, silent unless it persists. 
            }
        }, 5000); // 5s Check for faster detection
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async connect(): Promise<void> {
        // Only return if we are fully active. If we are in setup/offline, we should allow re-checks.
        if (this.isConnected && this.worldState === 'active') return;
        if (this.isConnecting) return;

        this.stopHeartbeat(); // Ensure clean slate
        this.isConnecting = true;
        const baseUrl = this.getBaseUrl();
        logger.info(`CoreSocket | Connecting to ${baseUrl}...`);

        try {
            // 1. Handshake & CSRF & Scraped Users
            const { csrfToken, isSetupMatch, users: scrapedUsers, pageTitle } = await this.performHandshake(baseUrl);

            // Detection: True Setup OR Gray State (No CSRF & No Users on /join AND Title indicates failure/generic)
            // If the title is a specific world name, we should try to connect even if scraping failed.
            const isGenericOrErrorTitle = !pageTitle || pageTitle === 'Foundry Virtual Tabletop' || pageTitle.includes('Critical Failure');

            if (isSetupMatch || ((!csrfToken && scrapedUsers.length === 0) && isGenericOrErrorTitle)) {
                logger.info(`CoreSocket | Detected Setup/Gray State (Title="${pageTitle}"). World is closed. Retrying in 5s...`);
                this.worldState = 'setup';
                setTimeout(() => this.connect(), 5000);
                return;
            }

            // If we have a specific world title, transition to STARTUP immediately to give UI feedback
            // This happens before the potentially slow Probe/Login steps.
            if (pageTitle && !isGenericOrErrorTitle && this.worldState !== 'active') {
                this.worldState = 'startup';
                logger.info(`CoreSocket | World Detected (${pageTitle}). Transitioning to startup...`);
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
                logger.warn('CoreSocket | Discovery failed completely. No world data or users found. Retrying in 5s...');
                this.worldState = 'offline';
                setTimeout(() => this.connect(), 5000);
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
                    return;
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
                        this.gameDataCache = null; // Clear potential stale cache
                        this.userMap.clear();
                        clearTimeout(timeout);
                        this.emit('connect');
                        resolve();
                        return;
                    }

                    logger.info('CoreSocket | World is ACTIVE. Fetching game data via socket...');
                    this.worldState = 'active';

                    // Start Heartbeat to detect return to setup
                    this.startHeartbeat();

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
                                ...this.userMap.get(u._id || u.id),
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
                    this.stopHeartbeat();
                    // Don't overwrite setup state if we manually triggered it via heartbeat
                    if (this.worldState !== 'setup') {
                        this.worldState = 'offline';
                    }
                    this.gameDataCache = null; // Clear cache to prevent stale data
                    this.userMap.clear();
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
                    else {
                        this._updateActorCache(data.type, data.action, data.result, data.operation);
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
            // Retry on error
            setTimeout(() => this.connect(), 5000);
        } finally {
            this.isConnecting = false;
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

        // Normalize data and updates to arrays if provided
        if (operation.data && !Array.isArray(operation.data)) {
            operation.data = [operation.data];
        }
        if (operation.updates && !Array.isArray(operation.updates)) {
            operation.updates = [operation.updates];
        }

        if (parent) {
            // Mapping simplistic type/id to UUID
            operation.parentUuid = `${parent.type}.${parent.id}`;
        }
        else if (operation.parent && typeof operation.parent === 'object') {
            operation.parentUuid = `${operation.parent.type}.${operation.parent.id}`;
            delete operation.parent;
        }

        try {
            const result: any = await this.emitSocketEvent('modifyDocument', { type, action, operation }, 5000);
            this.consecutiveFailures = 0;

            // Proactive Cache Update (Initiator Confirmation)
            if (result && (type === 'Actor' || type === 'Item')) {
                this._updateActorCache(type, action, result.result, result.operation || operation);
            }

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
            return level >= 2; // Observer or better
        });
    }

    public async getFolders(type?: string): Promise<any[]> {
        const result: any = await this.dispatchDocumentSocket('Folder', 'get', { broadcast: false });
        let all = result?.result || [];

        if (type) {
            all = all.filter((f: any) => f.type === type);
        }

        return all;
    }

    public async getActors(userId?: string): Promise<any[]> {
        const result: any = await this.dispatchDocumentSocket('Actor', 'get', { broadcast: false });
        const all = result?.result || [];
        if (!userId) return all;

        return all.filter((a: any) => {
            const level = a.ownership?.[userId] !== undefined ? a.ownership[userId] : (a.ownership?.default || 0);
            return level >= 2;
        });
    }

    public async getActor(id: string, forceSystemId?: string): Promise<any> {
        let data = this.actorDataCache.get(id);

        if (!data) {
            logger.debug(`CoreSocket | Cache miss for actor ${id}, fetching from Foundry...`);
            // CoreSocket returns the actor. Caller handles permissions if needed or we trust internal logic.
            const response: any = await this.dispatchDocumentSocket('Actor', 'get', { query: { _id: id }, broadcast: false });
            data = response?.result?.[0];
            if (data) {
                this.actorDataCache.set(id, data);
            }
        } else {
            logger.debug(`CoreSocket | Cache hit for actor ${id}`);
        }

        // RETURN CLONE: Never return the cached reference as it may be mutated by adapters
        return data ? structuredClone(data) : null;
    }

    public async getActorRaw(id: string): Promise<any> {
        let data = this.actorDataCache.get(id);

        if (!data) {
            const response: any = await this.dispatchDocumentSocket('Actor', 'get', { query: { _id: id }, broadcast: false });
            data = response?.result?.[0];
            if (data) {
                this.actorDataCache.set(id, data);
            }
        }

        return data ? structuredClone(data) : null;
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

        // 2a. System Fallback (Try first for speed & reliability)
        if (this.adapter?.resolveDocument) {
            const resolved = await this.adapter.resolveDocument(this, uuid);
            if (resolved) return resolved;
        }

        // 2b. Foundry Network Fetch
        // 2b. Foundry Network Fetch
        // Try both singular and plural collection names if needed
        const typesToTry = [type];
        if (type === 'Item') typesToTry.push('Items');
        else if (type === 'JournalEntry') typesToTry.push('JournalEntries');
        else if (type === 'Actor') typesToTry.push('Actors');

        for (const t of typesToTry) {
            try {
                // Fetch using the standard 'ids' operation
                const response: any = await this.emitSocketEvent('getDocuments', {
                    type: t,
                    operation: { pack: packId, ids: [id] }
                }, 1500); // Shorter timeout for faster iteration

                if (response?.result && Array.isArray(response.result) && response.result.length > 0) {
                    return response.result[0];
                }
            } catch (e) {
                // Try next type
                continue;
            }
        }

        return null;
    }

    async updateActor(id: string, data: any): Promise<any> {
        // Update uses 'updates' array in operation
        return await this.dispatchDocumentSocket('Actor', 'update', { updates: [{ _id: id, ...data }] });
    }

    async createActor(data: any): Promise<any> {
        // Normalize to array for 'data' field in socket operation
        const batch = Array.isArray(data) ? data : [data];
        const response = await this.dispatchDocumentSocket('Actor', 'create', { data: batch });
        // Return first document if single creation, otherwise full result array
        return Array.isArray(data) ? response?.result : response?.result?.[0];
    }

    async deleteActor(id: string): Promise<any> {
        // Delete uses 'ids' array in operation
        return await this.dispatchDocumentSocket('Actor', 'delete', { ids: [id] });
    }

    async dispatchDocument(type: string, action: string, operation?: any, parent?: { type: string, id: string }): Promise<any> {
        return await this.dispatchDocumentSocket(type, action, operation, parent);
    }

    async createActorItem(actorId: string, itemData: any): Promise<any> {
        // Normalize to array for 'data' field
        const batch = Array.isArray(itemData) ? itemData : [itemData];
        const response = await this.dispatchDocumentSocket('Item', 'create',
            { data: batch },
            { type: 'Actor', id: actorId }
        );
        // Return first ID if single creation, otherwise array of IDs/docs
        if (Array.isArray(itemData)) {
            return response?.result;
        }
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
        const raw = response?.result || [];

        // 1. Sort Chronologically (Oldest -> Newest)
        // We do this BEFORE filtering to ensure we have the full context
        const sorted = [...raw].sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

        // 2. Filter based on requesting user
        const filtered = sorted.filter((msg: any) => {
            if (!userId) return true; // Internal calls see all

            const requestingUser = userId ? this.userMap.get(userId) : null;
            const isGM = (requestingUser?.role || requestingUser?.permissions?.role || 0) >= 3;

            const whisper = msg.whisper || [];
            const isPublic = whisper.length === 0;
            const isAuthor = msg.author === userId;
            const isWhisperToMe = whisper.includes(userId);

            if (isPublic) return true;
            if (isGM) return true;
            if (isAuthor) return true;
            if (isWhisperToMe) return true;

            return false;
        });

        // 4. Slice to the most recent 'limit' messages
        const latest = filtered.slice(-limit);

        return latest.map((msg: any) => {
            const requestingUser = userId ? this.userMap.get(userId) : null;
            const isGM = (requestingUser?.role || requestingUser?.permissions?.role || 0) >= 3;

            // Support both stringified and object-based rolls
            const rolls = (msg.rolls || []).map((r: any) => {
                if (typeof r === 'string') {
                    try {
                        return JSON.parse(r);
                    } catch (e) {
                        return r;
                    }
                }
                return r;
            });

            const roll = rolls[0];
            const isRoll = msg.type === 5;
            const isBlind = msg.blind === true;

            // Masking: Hide roll results from non-GMs if message is blind
            const shouldMask = isBlind && !isGM;

            // Resolve Name: Prioritize User Name from author ID map
            const author = this.userMap.get(msg.author);
            const userName = author?.name || msg.alias || 'Unknown';

            return {
                ...msg,
                user: userName,
                timestamp: msg.timestamp || Date.now(),
                isRoll: isRoll,
                rolls: shouldMask ? [] : rolls,
                rollTotal: shouldMask ? undefined : (roll?.total !== undefined ? roll.total : (isRoll ? msg.content : undefined)),
                rollFormula: shouldMask ? "???" : (roll?.formula || (isRoll ? msg.flavor : undefined)),
                flavor: msg.flavor
            };
        });
    }

    public async sendMessage(content: string | any, userId?: string, options?: { rollMode?: string, speaker?: any }): Promise<any> {
        // If userId is provided, we try to create the message AS that user.
        // Since we are GM/Service, we can set 'author' to any user ID.
        const auth = userId || this.userId;
        if (!auth) throw new Error("Cannot send message: Author ID missing");

        const data: any = typeof content === 'string'
            ? { content, type: 1, author: auth }
            : { type: 1, author: auth, ...content };

        // Handle Speaker
        if (options?.speaker) {
            if (typeof options.speaker === 'string') {
                data.speaker = { alias: options.speaker };
            } else {
                data.speaker = options.speaker;
            }
        }

        // Handle Roll Mode
        if (options?.rollMode) {
            const modeData = await this.resolveRollMode(options.rollMode, auth);
            Object.assign(data, modeData);
        }

        return await this.dispatchDocumentSocket('ChatMessage', 'create', { data: [data] });
    }

    public async roll(formula: string, flavor?: string, options?: { userId?: string, rollMode?: string, speaker?: any, displayChat?: boolean }): Promise<any> {
        try {
            // Dynamic import to avoid circular dependencies if any (though Roll is standalone)
            const { Roll } = await import('../classes/Roll'); // Path check required
            const roll = new Roll(formula);
            await roll.evaluate();

            const displayChat = options?.displayChat !== false;
            const auth = options?.userId || this.userId;
            const chatData: any = {
                author: auth,
                content: String(roll.total),
                flavor: flavor,
                type: 5, // ROLL (standard Foundry ChatMessage type)
                rolls: [JSON.stringify(roll.toJSON())], // Explicit stringification for safe transport
                flags: {},
                sound: 'sounds/dice.wav' // Optional: generic sound
            };

            // Handle Speaker
            const speaker = options?.speaker;
            if (speaker) {
                if (typeof speaker === 'string') {
                    chatData.speaker = { alias: speaker };
                } else {
                    chatData.speaker = speaker;
                }
            }

            // Handle Roll Mode
            if (options?.rollMode) {
                const modeData = await this.resolveRollMode(options.rollMode, auth);
                Object.assign(chatData, modeData);
            }

            if (displayChat) {
                const response: any = await this.dispatchDocumentSocket('ChatMessage', 'create', { data: [chatData] });
                return response?.result?.[0];
            }

            // Return a synthetic message object if chat is suppressed
            return {
                ...chatData,
                _synthetic: true
            };
        } catch (e: any) {
            logger.error(`CoreSocket | Roll failed: ${e.message}`);
            if (options?.displayChat !== false) {
                // Fallback to text message
                return await this.sendMessage(`Rolling ${formula}: ${flavor || ''} (Error: ${e.message})`, options?.userId);
            }
            throw e;
        }
    }




    /**
     * Resolve the whisper and blind flags based on the roll mode.
     * Uses standardized RollMode strings: publicroll, gmroll, blindroll, selfroll
     */
    private async resolveRollMode(mode: string, userId: string | null) {
        if (mode === 'publicroll') return {};
        if (mode === 'selfroll') return { whisper: userId ? [userId] : [] };

        // For blind/private/gm, we need GM users
        const users = await this.getUsers();
        // Role 4 is GM, 3 is Assistant GM
        const gmIds = users.filter((u: any) => (u.role || u.permissions?.role) >= 3).map((u: any) => u._id || u.id);

        // Include author (userId) in whisper array for non-blind rolls so they can see their own result
        const authorId = userId ? [userId] : [];

        if (mode === 'gmroll') return { whisper: Array.from(new Set([...gmIds, ...authorId])) };
        if (mode === 'blindroll') return { blind: true, whisper: gmIds };

        // Compatibility for legacy or other naming conventions
        if (mode === 'public') return {};
        if (mode === 'self') return { whisper: userId ? [userId] : [] };
        if (mode === 'gm') return { whisper: Array.from(new Set([...gmIds, ...authorId])) };
        if (mode === 'blind') return { blind: true, whisper: gmIds };
        if (mode === 'private') return { whisper: Array.from(new Set([...gmIds, ...authorId])) };

        return {};
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

    public getUser(userId: string): any {
        return this.userMap.get(userId);
    }
}
