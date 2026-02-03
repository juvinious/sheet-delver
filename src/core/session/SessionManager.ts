import { SocketFoundryClient } from '../foundry/SocketClient';
import { FoundryConfig } from '../foundry/types';
import { logger } from '../logger';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface Session {
    id: string;
    client: SocketFoundryClient;
    userId: string;
    username: string;
    lastActive: number;
    worldId?: string;
    cookie?: string;
}

export class SessionManager {
    private config: FoundryConfig;
    private systemClient: SocketFoundryClient; // Service Account Client for World Verification
    private sessions: Map<string, Session> = new Map();
    private readonly SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 24; // 24 Hours
    private readonly SESSIONS_FILE = path.join(process.cwd(), '.foundry-session.json');
    private readonly SYSTEM_SESSION_KEY = 'SYSTEM_SERVICE_ACCOUNT';
    private isSaving: boolean = false;

    constructor(config: FoundryConfig) {
        this.config = config;

        // Initialize System Client WITH Service Account Credentials and System Flag
        this.systemClient = new SocketFoundryClient(config, true);
    }

    public async initialize() {
        logger.info('SessionManager | Initializing System Client (Service Account)...');
        try {
            const restored = await this.tryRestoreSession(this.SYSTEM_SESSION_KEY, true);

            if (restored) {
                logger.info('SessionManager | System Client restored from cache.');
                this.systemClient = restored.client;
                return;
            }

            logger.info('SessionManager | No valid system session found in cache. Performing fresh login.');
            await this.systemClient.connect();

            if (this.config.username && this.config.password) {
                await this.systemClient.login(this.config.username, this.config.password);
                logger.info('SessionManager | System Client authenticated successfully.');
                await this.saveSession(this.SYSTEM_SESSION_KEY, this.systemClient, this.config.username);
                await this.systemClient.getSystem();
            } else {
                logger.warn('SessionManager | No service account credentials provided.');
            }
        } catch (e: any) {
            logger.error(`SessionManager | System Client failed to initialize: ${e.message}`);
        }
    }

    public getSystemClient(): SocketFoundryClient {
        return this.systemClient;
    }

    public async createSession(username: string, password?: string): Promise<{ sessionId: string, userId: string }> {
        logger.info(`SessionManager | Creating session for user: ${username}`);
        const client = new SocketFoundryClient({ ...this.config, username, password }, false);

        try {
            await client.connect();
            await client.login(username, password);

            if (!client.userId) throw new Error('Login failed: No User ID returned.');

            const sessionId = randomUUID();
            const session = {
                id: sessionId,
                client,
                userId: client.userId,
                username,
                lastActive: Date.now(),
                worldId: (client as any).cachedWorldData?.worldId,
                cookie: (client as any).sessionCookie
            };
            this.sessions.set(sessionId, session);

            // Hook up invalidation callback to purge memory/disk if client resets
            client.onSessionInvalidated = () => {
                logger.warn(`SessionManager | Session ${sessionId} (${username}) invalidated by client. Purging.`);
                this.sessions.delete(sessionId);
                this.clearSession(sessionId).catch(e => logger.warn(`Failed to clear session ${sessionId}: ${e}`));
            };

            await this.saveSession(sessionId, client, username);

            logger.info(`SessionManager | Session created: ${sessionId} (User: ${username})`);
            return { sessionId, userId: client.userId };

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
            await session.client.logout();
            session.client.disconnect();
            this.sessions.delete(sessionId);
            await this.clearSession(sessionId);
        }
    }

    public isValidSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    public async tryRestoreSession(username: string, isSystem: boolean = false): Promise<{ client: SocketFoundryClient, userId: string, sessionId: string } | null> {
        try {
            const cached = await this.loadSessions();
            if (!cached) return null;

            const sessionData = cached[username];
            if (!sessionData) return null;

            if (!sessionData.cookie || !sessionData.userId || !sessionData.worldId) {
                logger.warn(`SessionManager | Cached session for ${username} is incomplete.`);
                return null;
            }

            const foundryUsername = sessionData.username || username;
            logger.info(`SessionManager | Attempting to restore session for ${foundryUsername} (Key: ${username})...`);

            let currentWorldId: string | null = null;
            try {
                const baseUrl = this.config.url.endsWith('/') ? this.config.url.slice(0, -1) : this.config.url;
                const res = await fetch(`${baseUrl}/api/status`);
                if (res.ok) {
                    const status = await res.json();
                    currentWorldId = status.world;
                }
            } catch (e) {
                logger.warn(`SessionManager | API probe failed during restoration: ${e}`);
            }

            if (!currentWorldId && this.systemClient) {
                await this.systemClient.getSystem();
                currentWorldId = (this.systemClient as any).cachedWorldData?.worldId;
            }

            if (currentWorldId && currentWorldId !== sessionData.worldId) {
                logger.warn(`SessionManager | World mismatch (${sessionData.worldId} vs ${currentWorldId}). Purging key ${username}.`);
                await this.clearSession(username);
                return null;
            }

            const client = new SocketFoundryClient({
                ...this.config,
                username: foundryUsername,
                userId: sessionData.userId
            }, isSystem);

            await client.restoreSession(sessionData.cookie, sessionData.userId);

            if (!currentWorldId) {
                logger.warn(`SessionManager | Restoration deferred: World ID unknown.`);
                client.disconnect();
                return null;
            }

            logger.info(`SessionManager | Validating restored session for ${foundryUsername} against world ${currentWorldId}...`);
            const isValid = await client.validateSession(currentWorldId);
            if (!isValid) {
                logger.warn(`SessionManager | Session validation failed for ${foundryUsername} (Key: ${username}). Purging from disk/memory.`);
                client.disconnect();
                // If world is active and we fail validation, the session is definitely dead. Purge it.
                await this.clearSession(username);
                this.sessions.delete(username);
                return null;
            }

            logger.info(`SessionManager | Successfully restored session for ${foundryUsername} (Key: ${username}).`);

            if (!isSystem) {
                const sessionId = username;
                this.sessions.set(sessionId, {
                    id: sessionId, client, userId: sessionData.userId,
                    username: foundryUsername, lastActive: Date.now(),
                    worldId: sessionData.worldId, cookie: sessionData.cookie
                });

                // Hook up invalidation callback
                client.onSessionInvalidated = () => {
                    logger.warn(`SessionManager | Restored session ${sessionId} (${foundryUsername}) invalidated by client. Purging.`);
                    this.sessions.delete(sessionId);
                    this.clearSession(sessionId).catch(e => logger.warn(`Failed to clear session ${sessionId}: ${e}`));
                };

                return { client, userId: sessionData.userId, sessionId } as any;
            }

            return { client, userId: sessionData.userId, sessionId: username };

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
                worldId: (client as any).cachedWorldData?.worldId,
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
