import { CoreSocket } from '../foundry/sockets/CoreSocket';
import { ClientSocket } from '../foundry/sockets/ClientSocket';
import { FoundryConfig } from '../foundry/types';
import { logger } from '../logger';

const isBrowser = typeof window !== 'undefined';
let fs: any = null;
let path: any = null;
let crypto: any = null;

async function loadDeps() {
    if (isBrowser) return false;
    if (fs && path && crypto) return true;
    try {
        const fsMod = await import('node:fs');
        const pathMod = await import('node:path');
        const cryptoMod = await import('node:crypto');
        fs = fsMod.default || fsMod;
        path = pathMod.default || pathMod;
        crypto = cryptoMod.default || cryptoMod;
        return true;
    } catch (e) {
        return false;
    }
}
import { persistentCache } from '../cache/PersistentCache';

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
    private readonly CACHE_NS = 'core';
    private readonly CACHE_KEY = 'sessions';
    private LEGACY_SESSIONS_FILE = '';
    private readonly SYSTEM_SESSION_KEY = 'SYSTEM_SERVICE_ACCOUNT';
    private isSaving: boolean = false;
    private cacheInstance: any = null;

    constructor(config: FoundryConfig) {
        this.config = config;

        // Initialize Core/System Socket
        this.systemClient = new CoreSocket(config);
    }

    public async initialize() {
        if (!isBrowser) {
            await loadDeps();
            if (path) {
                this.LEGACY_SESSIONS_FILE = path.join(process.cwd(), '.foundry-session.json');
            }
        }

        logger.info('SessionManager | Initializing Core System Socket...');

        // 1. Check for legacy migration
        if (!isBrowser && fs && fs.existsSync(this.LEGACY_SESSIONS_FILE)) {
            try {
                logger.info('SessionManager | Migrating legacy sessions to PersistentCache...');
                const raw = fs.readFileSync(this.LEGACY_SESSIONS_FILE, 'utf-8');
                const legacyData = JSON.parse(raw);
                await persistentCache.set(this.CACHE_NS, this.CACHE_KEY, legacyData);
                // We keep the file for now, will delete in cleanup step
                logger.info('SessionManager | Legacy session migration complete.');
            } catch (e) {
                logger.error('SessionManager | Legacy migration failed:', e);
            }
        }

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

    public setCache(cache: any) {
        this.cacheInstance = cache;
    }

    public async createSession(username: string, password?: string): Promise<{ sessionId: string, userId: string }> {
        logger.info(`SessionManager | Creating session for user: ${username}`);
        // Note: We don't implement login inside ClientSocket yet, waiting on user to verify separation.
        // For now, ClientSocket expects a resumed session or guest interaction.
        // IF we need explicit login, we should add a login() method to ClientSocket similar to CoreSocket.
        // Assuming we need to replicate the SocketClient "login" behavior here for now.

        // Enforce Single Session per User: Cleanup any existing sessions for this user
        for (const [id, session] of this.sessions.entries()) {
            if (session.username === username) {
                logger.info(`SessionManager | Found existing session for ${username} (${id}). Destroying...`);
                await this.destroySession(id);
            }
        }

        const client = new ClientSocket({ ...this.config, username, password }, this.systemClient);

        try {
            // ClientSocket connects individually to act as an Auth Anchor
            await client.login(username, password);

            const sessionId = crypto ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36));
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

        if (this.systemClient.worldState === 'setup') {
            return undefined;
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

    public async clearAllSessions() {
        logger.info('SessionManager | Invalidating all sessions due to world disconnect/setup.');
        for (const sessionId of this.sessions.keys()) {
            await this.destroySession(sessionId);
        }
        this.sessions.clear();
        await persistentCache.delete(this.CACHE_NS, this.CACHE_KEY);
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

            // Strict Validation: Must have an active world, and it must match the session's world
            if (!currentWorldId || currentWorldId !== sessionData.worldId) {
                logger.warn(`SessionManager | World mismatch or not active (Current: ${currentWorldId}). Purging key ${username}.`);
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
            const sessions = (await this.loadSessions()) || {};

            sessions[key] = {
                username: foundryUsername || key,
                userId: client.userId,
                cookie: (client as any).sessionCookie,
                worldId: this.systemClient.getGameData()?.world?.id,
                lastSaved: Date.now()
            };

            await persistentCache.set(this.CACHE_NS, this.CACHE_KEY, sessions);
            logger.info(`SessionManager | Saved session for ${foundryUsername || key} (Key: ${key}) to disk. Total: ${Object.keys(sessions).length}`);
        } catch (e) {
            logger.warn(`SessionManager | Failed to save session: ${e}`);
        } finally {
            this.isSaving = false;
        }
    }

    private async loadSessions(): Promise<Record<string, any> | null> {
        try {
            return await persistentCache.get<Record<string, any>>(this.CACHE_NS, this.CACHE_KEY) || {};
        } catch (e) {
            logger.error(`SessionManager | CRITICAL: Failed to load sessions: ${e}`);
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
                await persistentCache.set(this.CACHE_NS, this.CACHE_KEY, sessions);
                logger.info(`SessionManager | Cleared key ${key} from disk.`);
            }
        } finally {
            this.isSaving = false;
        }
    }
}
