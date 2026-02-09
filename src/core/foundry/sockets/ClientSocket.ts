import { io } from 'socket.io-client';
import { CoreSocket } from './CoreSocket';
import { SocketBase } from './SocketBase';
import { logger } from '../../logger';
import { FoundryConfig } from '../types';

export class ClientSocket extends SocketBase {
    public userId: string | null = null;
    public isExplicitSession: boolean = false;
    private isRestored: boolean = false;
    private coreSocket: CoreSocket;

    constructor(config: FoundryConfig, coreSocket: CoreSocket) {
        super(config);
        this.coreSocket = coreSocket;
    }

    async connect(): Promise<void> {
        if (this.isConnected) return;
        const baseUrl = this.getBaseUrl();
        logger.info(`ClientSocket | Connecting Presence Anchor for user ${this.config.username}...`);

        try {
            const restoredCookie = this.isRestored ? this.sessionCookie : null;

            // 1. Handshake & CSRF & Scraped Users
            const { csrfToken, isSetupMatch, users: scrapedUsers } = await this.performHandshake(baseUrl);

            if (this.isRestored && restoredCookie) {
                this.updateCookies(restoredCookie);
                logger.debug(`ClientSocket | Restored authenticated cookie after handshake`);
            }

            if (isSetupMatch) {
                throw new Error("Cannot connect ClientSocket in Setup Mode");
            }

            // 2. Identification (via Discovery Probe or Scraped Fallback)
            if (!this.userId) {
                logger.info('ClientSocket | Identifying user ID...');
                // Prefer user map from CoreSocket if available
                const coreData = this.coreSocket.getGameData();
                const users = coreData?.users || (await this.probeWorldState(baseUrl))?.users || scrapedUsers;

                const user = users?.find((u: any) => u.name === this.config.username);
                if (user) {
                    this.userId = user._id;
                }
            }

            if (!this.userId) {
                throw new Error(`Could not identify user ID for ${this.config.username}`);
            }

            // 3. Login (Skip if we already have a session cookie from restoration)
            if (!this.isRestored) {
                await this.performLogin(baseUrl, this.userId, csrfToken);
            } else {
                logger.info(`ClientSocket | Bypassing login, using restored session cookie for ${this.userId}`);
            }

            // 4. Connect Main Socket
            const sessionId = this.getSessionId();
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("ClientSocket connection timeout")), 15000);

                this.socket = io(baseUrl, {
                    path: '/socket.io',
                    transports: ['websocket'],
                    upgrade: false,
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

                this.socket.on('session', (data: any) => {
                    if (data && data.userId) {
                        logger.info(`ClientSocket | Session verified for user ${data.userId}`);
                        this.userId = data.userId;
                        this.isSocketConnected = true;
                        this.setupSharedContentListeners(this.socket!);
                        clearTimeout(timeout);
                        this.emit('connect');
                        resolve();
                    }
                });

                this.socket.on('connect', () => {
                    logger.debug(`ClientSocket | Socket transport connected for ${this.userId}. Waiting for session event...`);
                });

                this.socket.on('disconnect', (reason: string) => {
                    logger.info(`ClientSocket | Presence Socket Disconnected: ${reason}`);
                    this.isSocketConnected = false;
                    this.emit('disconnect', reason);
                });

                this.socket.on('connect_error', (err) => {
                    logger.error(`ClientSocket | Socket connection error: ${err.message}`);
                    clearTimeout(timeout);
                    reject(err);
                });
            });

        } catch (e: any) {
            logger.error(`ClientSocket | Connection failed: ${e.message}`);
            throw e;
        }
    }

    public async login(username?: string, password?: string): Promise<void> {
        if (username) this.config.username = username;
        if (password) this.config.password = password;
        this.isExplicitSession = true;
        await this.connect();
    }

    public async restoreSession(cookie: string, userId: string): Promise<void> {
        logger.info(`ClientSocket | Restoring session for user ${userId}...`);
        this.userId = userId;
        this.sessionCookie = cookie;
        this.isExplicitSession = true;
        this.isRestored = true;

        // Populate cookieMap from existing cookie string
        const parts = cookie.split(';');
        parts.forEach(p => {
            const [k, v] = p.split('=');
            if (k && v) this.cookieMap.set(k.trim(), v.trim());
        });

        await this.connect();
    }

    public async validateSession(expectedWorldId: string): Promise<boolean> {
        if (!this.isConnected || !this.userId) return false;
        // Check core for world ID match
        const currentWorldId = this.coreSocket.getGameData()?.world?.id;
        return currentWorldId === expectedWorldId;
    }

    // --- Data Operations (Proxied to CoreSocket with userId filtering) ---

    public async getJournals(): Promise<any[]> {
        return this.coreSocket.getJournals(this.userId || undefined);
    }

    public async getChatLog(limit = 100): Promise<any[]> {
        return this.coreSocket.getChatLog(limit, this.userId || undefined);
    }

    public async sendMessage(content: string | any): Promise<any> {
        if (!this.userId) throw new Error("User ID not set on ClientSocket");
        return this.coreSocket.sendMessage(content, this.userId);
    }

    public async roll(formula: string, flavor?: string): Promise<any> {
        return this.coreSocket.roll(formula, flavor, this.userId || undefined);
    }

    public async getActors(): Promise<any[]> {
        return this.coreSocket.getActors(this.userId || undefined);
    }

    public async getActor(id: string): Promise<any> {
        return this.coreSocket.getActor(id);
    }

    public async getSystem(): Promise<any> {
        return this.coreSocket.getSystem();
    }

    public async updateActor(id: string, data: any): Promise<any> {
        return this.coreSocket.updateActor(id, data);
    }

    public async createActor(data: any): Promise<any> {
        // Normalize to array for 'data' field in socket operation
        const batch = Array.isArray(data) ? data : [data];
        const response = await this.dispatchDocument('Actor', 'create', { data: batch });
        // Return first document if single creation, otherwise full result array
        return Array.isArray(data) ? response?.result : response?.result?.[0];

        //return this.coreSocket.createActor(data);
    }

    public async deleteActor(id: string): Promise<any> {
        return this.coreSocket.deleteActor(id);
    }

    public async createActorItem(actorId: string, itemData: any): Promise<any> {
        return this.coreSocket.createActorItem(actorId, itemData);
    }

    public async updateActorItem(actorId: string, itemData: any): Promise<any> {
        return this.coreSocket.updateActorItem(actorId, itemData);
    }

    public async deleteActorItem(actorId: string, itemId: string): Promise<any> {
        return this.coreSocket.deleteActorItem(actorId, itemId);
    }

    public async fetchByUuid(uuid: string): Promise<any> {
        return this.coreSocket.fetchByUuid(uuid);
    }

    public async useItem(actorId: string, itemId: string): Promise<any> {
        return this.coreSocket.useItem(actorId, itemId);
    }

    public async getAllCompendiumIndices(): Promise<any[]> {
        return this.coreSocket.getAllCompendiumIndices();
    }

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

    public async dispatchDocument(type: string, action: string, operation: any = {}, parent?: { type: string, id: string }): Promise<any> {
        // If we represent a user session and are connected, USE OUR OWN SOCKET to act as the User
        if (this.isConnected && this.socket) {
            if (parent) {
                operation.parentUuid = `${parent.type}.${parent.id}`;
            }
            else if (operation.parent && typeof operation.parent === 'object') {
                operation.parentUuid = `${operation.parent.type}.${operation.parent.id}`;
                delete operation.parent;
            }

            try {
                return await this.emitSocketEvent('modifyDocument', { type, action, operation }, 5000);
            } catch (e: any) {
                logger.warn(`ClientSocket | Dispatch failed on user socket: ${e.message}`);
                throw e;
            }
        }

        return this.coreSocket.dispatchDocument(type, action, operation, parent);
    }

    public async getActorRaw(id: string): Promise<any> {
        return this.coreSocket.getActorRaw(id);
    }

    public getSystemAdapter() {
        return this.coreSocket.getSystemAdapter();
    }

    public async getSystemConfig(): Promise<any> {
        return this.coreSocket.getSystemConfig();
    }
    public async rollTable(tableUuid: string, options: {
        roll?: any;
        displayChat?: boolean;
        interactionId?: string;
        rollMode?: string;
        actorId?: string;
    } = {}): Promise<{
        roll: any;
        results: any[];
        total: number;
    }> {
        return this.coreSocket.rollTable(tableUuid, { ...options, userId: this.userId || undefined });
    }
}
