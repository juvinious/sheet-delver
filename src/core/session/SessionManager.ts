import { CoreSocket } from '../foundry/sockets/CoreSocket';
import { ClientSocket } from '../foundry/sockets/ClientSocket';
import { FoundryConfig } from '../foundry/types';
import { logger } from '../logger';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface Session {
    id: string;
    client: ClientSocket;
    userId: string;
    username: string;
    lastActive: number;
    worldId?: string;
    cookie?: string;
}

export class SessionManager {
    private config: FoundryConfig;
    private systemClient: CoreSocket; // Singleton Service Socket
    private sessions: Map<string, Session> = new Map();
    private readonly SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 24; // 24 Hours
    private readonly SESSIONS_FILE = path.join(process.cwd(), '.foundry-session.json');
    private readonly SYSTEM_SESSION_KEY = 'SYSTEM_SERVICE_ACCOUNT';
    private isSaving: boolean = false;
    private cacheInstance: any = null;

    constructor(config: FoundryConfig) {
        this.config = config;

        // Initialize Core/System Socket
        this.systemClient = new CoreSocket(config);
    }

    public async initialize() {
        logger.info('SessionManager | Initializing Core System Socket...');
        try {
            // Wait for connection AND world discovery
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("CoreSocket connection timeout")), 30000);
                this.systemClient.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                this.systemClient.connect().catch(reject);
            });
            logger.info('SessionManager | Core System Socket Ready.');

            // Initialize Compendium Cache (System Level) - Non-blocking background task
            (async () => {
                try {
                    const { CompendiumCache } = await import('../foundry/compendium-cache');
                    this.cacheInstance = CompendiumCache.getInstance();
                    await this.cacheInstance.initialize(this.systemClient);
                } catch (e: any) {
                    logger.error(`SessionManager | Compendium Cache failed to initialize: ${e.message}`);
                }
            })();

        } catch (e: any) {
            logger.error(`SessionManager | Core Socket failed to initialize: ${e.message}`);
        }
    }

    public getSystemClient(): CoreSocket {
        return this.systemClient;
    }

    public isCacheReady(): boolean {
        return this.cacheInstance?.hasLoaded() || false;
    }

    public async createSession(username: string, password?: string): Promise<{ sessionId: string, userId: string }> {
        logger.info(`SessionManager | Creating session for user: ${username}`);
        // Note: We don't implement login inside ClientSocket yet, waiting on user to verify separation.
        // For now, ClientSocket expects a resumed session or guest interaction.
        // IF we need explicit login, we should add a login() method to ClientSocket similar to CoreSocket.
        // Assuming we need to replicate the SocketClient "login" behavior here for now.

        const client = new ClientSocket({ ...this.config, username, password }, this.systemClient);

        try {
            // ClientSocket connects individually to act as an Auth Anchor
            await client.login(username, password);

            const sessionId = randomUUID();
            const userId = client.userId || 'unknown';

            const session = {
                id: sessionId,
                client,
                userId: userId,
                username,
                lastActive: Date.now(),
                worldId: this.systemClient.getGameData()?.world?.id, // Get from Core
                cookie: (client as any).sessionCookie
            };
            this.sessions.set(sessionId, session);

            await this.saveSession(sessionId, client, username);

            logger.info(`SessionManager | Session created: ${sessionId} (User: ${username}, ID: ${userId})`);
            return { sessionId, userId };

        } catch (e: any) {
            logger.error(`SessionManager | Failed to create session: ${e.message}`);
            client.disconnect();
            throw e;
        }
    }

    public async getOrRestoreSession(sessionId: string): Promise<Session | undefined> {
        let session = this.sessions.get(sessionId);
        if (session) {
            session.lastActive = Date.now();
            return session;
        }

        // Try to restore from disk with minor retries (for transient startup/world discovery issues)
        for (let i = 0; i < 3; i++) {
            const restored = await this.tryRestoreSession(sessionId, false);
            if (restored && restored.sessionId === sessionId) {
                return this.sessions.get(sessionId);
            }
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
        }

        return undefined;
    }

    public async destroySession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            logger.info(`SessionManager | Destroying session: ${sessionId}`);
            // session.client.logout(); 
            session.client.disconnect();
            this.sessions.delete(sessionId);
            await this.clearSession(sessionId);
        }
    }

    public isValidSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    public async tryRestoreSession(username: string, isSystem: boolean = false): Promise<{ client: CoreSocket | ClientSocket, userId: string, sessionId: string } | null> {
        // We only restore USER sessions here since System is handled in initialize()
        if (isSystem) return null;

        try {
            const cached = await this.loadSessions();
            if (!cached) return null;

            const sessionData = cached[username];
            if (!sessionData) return null;

            if (!sessionData.cookie || !sessionData.userId) {
                return null;
            }

            const foundryUsername = sessionData.username || username;

            // Check World State via Core Socket
            const currentWorldId = this.systemClient.getGameData()?.world?.id;

            if (currentWorldId && currentWorldId !== sessionData.worldId) {
                logger.warn(`SessionManager | World mismatch. Purging key ${username}.`);
                await this.clearSession(username);
                return null;
            }

            const client = new ClientSocket({
                ...this.config,
                username: foundryUsername,
            }, this.systemClient);

            await client.restoreSession(sessionData.cookie, sessionData.userId);

            const sessionId = username;
            this.sessions.set(sessionId, {
                id: sessionId, client, userId: sessionData.userId,
                username: foundryUsername, lastActive: Date.now(),
                worldId: sessionData.worldId, cookie: sessionData.cookie
            });

            return { client, userId: sessionData.userId, sessionId } as any;

        } catch (e) {
            logger.error(`SessionManager | Error during session restoration: ${e}`);
            return null;
        }
    }

    private async saveSession(key: string, client: any, foundryUsername?: string) {
        while (this.isSaving) await new Promise(r => setTimeout(r, 50));
        this.isSaving = true;
        try {
            const sessions = await this.loadSessions();
            if (sessions === null) {
                logger.error(`SessionManager | Aborting save for ${key}: Could not reliably load existing sessions.`);
                return;
            }

            sessions[key] = {
                username: foundryUsername || key,
                userId: client.userId,
                cookie: (client as any).sessionCookie,
                worldId: this.systemClient.getGameData()?.world?.id,
                lastSaved: Date.now()
            };

            this.atomicWriteSync(this.SESSIONS_FILE, sessions);
            logger.info(`SessionManager | Saved session for ${foundryUsername || key} (Key: ${key}) to disk. Total: ${Object.keys(sessions).length}`);
        } catch (e) {
            logger.warn(`SessionManager | Failed to save session: ${e}`);
        } finally {
            this.isSaving = false;
        }
    }

    private async loadSessions(): Promise<Record<string, any> | null> {
        try {
            if (!fs.existsSync(this.SESSIONS_FILE)) return {};
            const content = fs.readFileSync(this.SESSIONS_FILE, 'utf-8');
            if (!content.trim()) return {};
            return JSON.parse(content);
        } catch (e) {
            logger.error(`SessionManager | CRITICAL: Failed to parse sessions file: ${e}`);
            return null; // Signals failure, do not overwrite
        }
    }

    private async clearSession(key: string) {
        while (this.isSaving) await new Promise(r => setTimeout(r, 50));
        this.isSaving = true;
        try {
            const sessions = await this.loadSessions();
            if (sessions && sessions[key]) {
                delete sessions[key];
                this.atomicWriteSync(this.SESSIONS_FILE, sessions);
                logger.info(`SessionManager | Cleared key ${key} from disk.`);
            }
        } finally {
            this.isSaving = false;
        }
    }

    private atomicWriteSync(filePath: string, data: any) {
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, filePath);
    }
}
