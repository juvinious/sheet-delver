import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { FoundryConfig } from './types';
import { FoundryClient } from './interfaces';
import { getAdapter } from '../../modules/core/registry';
import { SystemAdapter } from '../../modules/core/interfaces';
import { logger } from '../logger';

export class SocketFoundryClient implements FoundryClient {
    private config: FoundryConfig;
    private adapter: SystemAdapter | null = null;
    private socket: Socket | null = null;
    private sessionCookie: string | null = null;
    private discoveredUserId: string | null = null;
    public userId: string | null = null;
    private isJoining: boolean = false;
    public isConnected: boolean = false;

    constructor(config: FoundryConfig) {
        this.config = config;
    }

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

        if (this.isConnected) {
            this.disconnect();
        }
        await this.connect();
    }

    async logout(): Promise<void> {
        this.disconnect();
    }

    async connect(): Promise<void> {
        // Socket connection is now considered stable for v13.

        if (this.isConnected) return;

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

                let userId = this.config.userId || html.match(new RegExp(`option value="([^"]+)">[^<]*${this.config.username}`, 'i'))?.[1];
                if (!userId) {
                    userId = html.match(new RegExp(`"id":"([^"]+)"[^{}]*"name":"${this.config.username}"`, 'i'))?.[1];
                }
                if (!userId) {
                    logger.warn(`SocketFoundryClient | User "${this.config.username}" not found in /join HTML. Using config fallback.`);
                    logger.info(`SocketFoundryClient | /join HTML content preview: ${html.substring(0, 2000)}`);
                    userId = this.config.username;
                }
                this.discoveredUserId = userId;

                const loginResponse = await fetch(`${baseUrl}/join`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SheetDelver/1.0',
                        'Cookie': Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
                    },
                    body: JSON.stringify({
                        userid: userId,
                        password: this.config.password || '',
                        action: 'join'
                    }),
                    redirect: 'manual'
                });

                addCookies(loginResponse.headers.get('set-cookie'));

                logger.info(`SocketFoundryClient | Login POST status: ${loginResponse.status}`);
                if (loginResponse.status !== 302 && loginResponse.status !== 200) {
                    const loginBody = await loginResponse.text();
                    logger.warn(`SocketFoundryClient | Login POST body: ${loginBody.substring(0, 500)}`);
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
        return new Promise((resolve, reject) => {
            this.isJoining = false;

            // Robustly extract sessionId from cookie (name might be 'session' or 'foundry')
            let sessionId: string | undefined;
            if (this.sessionCookie) {
                const cookieParts = this.sessionCookie.split(';')[0].split('=');
                if (cookieParts.length >= 2) {
                    sessionId = cookieParts[1];
                    logger.info(`SocketFoundryClient | Extracted sessionId from cookie: ${sessionId.substring(0, 8)}... (name: ${cookieParts[0]})`);
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
                query: sessionId ? { session: sessionId } : {},
                auth: sessionId ? { session: sessionId } : {},
                extraHeaders: headers,
                withCredentials: true
            });
            logger.info(`SocketFoundryClient | Final socket options: path=${(this.socket as any).io.opts.path}, query=${JSON.stringify((this.socket as any).io.opts.query)}, auth=${JSON.stringify((this.socket as any).auth)}`);

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
            });

            socket.io.on('reconnect_attempt', (attempt) => {
                logger.info('SocketFoundryClient | Reconnect attempt: ' + attempt);
            });

            socket.io.on('error', (error) => {
                logger.error('SocketFoundryClient | Socket.io error: ' + error);
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

                    if (data.userId) {
                        logger.info(`SocketFoundryClient | Session event. data.userId: ${data.userId}`);
                        this.discoveredUserId = data.userId;
                        this.userId = data.userId;

                        // Mark as connected - passive approach, no join emission
                        if (!this.isConnected) {
                            this.isConnected = true;
                            resolve();
                        }
                    } else {
                        logger.info(`SocketFoundryClient | Session event. data.userId not present (yet).`);
                    }
                }

                // Detect userActivity for self as fallback connection indicator
                if (event === 'userActivity') {
                    const [userId, activityData] = args;
                    if (userId === this.discoveredUserId && !this.isConnected) {
                        logger.info(`SocketFoundryClient | Detected userActivity for self (${userId}). Assuming connected.`);
                        this.isConnected = true;
                        resolve();
                    }
                }


                if ((event === 'ready' || event === 'init') && !this.isConnected) {
                    logger.info(`SocketFoundryClient | Received '${event}'. Connected.`);
                    this.isConnected = true;
                    this.isJoining = false;
                    resolve();
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
                    this.isConnected = true;
                    this.isJoining = false;
                    resolve();
                }
            });

            socket.on('connect_error', (error: any) => {
                this.isConnected = false;
                logger.error('SocketFoundryClient | Connection error:', error);
                reject(error);
            });

            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error("Timeout waiting for Foundry session/authentication. Ensure world is active and user is not already blocked by a ghost session."));
                }
            }, 60000); // 60s for slower environments
        });
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this.socket = null;
        this.sessionCookie = null;
        this.isConnected = false;
        this.isJoining = false;
        logger.info("SocketFoundryClient | Disconnected.");
    }

    private async emit<T>(event: string, ...args: any[]): Promise<T> {
        if (!this.socket || !this.isConnected) {
            throw new Error(`Not connected to Foundry (event: ${event})`);
        }

        const socket = this.socket;
        const requestId = Math.random().toString(36).substring(7);

        return new Promise((resolve, reject) => {
            if (process.env.NODE_ENV !== 'production') {
                logger.info(`SocketFoundryClient | EMIT [${requestId}]: ${event}`, JSON.stringify(args));
            }

            socket.emit(event, ...args, (response: any) => {
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

            setTimeout(() => reject(new Error(`Timeout waiting for event: ${event} [${requestId}]`)), 15000);
        });
    }

    /**
     * Dispatches a document socket request using the Foundry v13 protocol.
     * @param type The document type (e.g., "Actor", "Item")
     * @param action The action (get, create, update, delete)
     * @param operation The operation parameters
     * @param parent Specific parent context (optional)
     */
    private async dispatchDocumentSocket(type: string, action: string, operation: any = {}, parent?: { type: string, id: string }): Promise<any> {
        // v13 Protocol: { type, action, operation: { parentUuid?, [action]?, ...args } }

        // Ensure action is set in operation
        operation.action = action;

        // Handle parent logic: convert {type, id} to parentUuid string
        if (parent) {
            // Mapping simplistic type/id to UUID
            // Root documents (Actor) don't have parents. 
            // Embedded (Item, ActiveEffect): Actor.ID
            operation.parentUuid = `${parent.type}.${parent.id}`;
            // NOTE: This assumes standard UUID format. 
            // If parent is World-level, it might just be the ID if type is omitted? 
            // But static analysis showed `ClientDatabaseBackend.#buildRequest` handles this.
            // Safe bet for Actor items: "Actor.<ActorId>"
        }
        // If operation has parent object, process it
        else if (operation.parent && typeof operation.parent === 'object') {
            operation.parentUuid = `${operation.parent.type}.${operation.parent.id}`;
            delete operation.parent;
        }

        const payload = {
            type,
            action,
            operation
        };

        return await this.emit('modifyDocument', payload);
    }

    async evaluate<T>(pageFunction: any, arg?: any): Promise<T> {
        logger.warn(`SocketFoundryClient | evaluate() not supported.`);
        return null as any;
    }

    async getSystem(): Promise<any> {
        if (!this.isConnected) return { id: 'unknown' };
        try {
            // Fetch core.system setting
            const response: any = await this.dispatchDocumentSocket('Setting', 'get', {
                query: { key: 'core.system' },
                broadcast: false
            });
            const systems = response?.result || [];
            if (systems && systems.length > 0) {
                return { id: systems[0].value };
            }
        } catch (e) {
            logger.warn(`SocketFoundryClient | Failed to fetch system info: ${e}`);
        }
        return { id: 'shadowdark', version: '1.0.0', world: 'unknown' };
    }

    async getUsers(): Promise<any[]> {
        const response: any = await this.dispatchDocumentSocket('User', 'get', { broadcast: false });
        return response?.result || [];
    }

    async getUsersDetails(): Promise<any[]> {
        return this.getUsers();
    }

    async getSystemData(): Promise<any> {
        const adapter = await this.resolveAdapter();
        return await adapter.getSystemData(this);
    }

    async getActors(): Promise<any[]> {
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

    async toggleStatusEffect(actorId: string, effectId: string, active?: boolean, overlay?: boolean): Promise<any> {
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
