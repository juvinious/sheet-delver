import { SocketFoundryClient } from '../foundry/SocketClient';
import { FoundryConfig } from '../foundry/types';
import { logger } from '../logger';
import { randomUUID } from 'crypto';

interface Session {
    id: string;
    client: SocketFoundryClient;
    userId: string;
    username: string;
    lastActive: number;
}

export class SessionManager {
    private config: FoundryConfig;
    private systemClient: SocketFoundryClient; // Service Account Client for World Verification
    private sessions: Map<string, Session> = new Map();
    private readonly SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 24; // 24 Hours

    constructor(config: FoundryConfig) {
        this.config = config;

        // Initialize System Client WITH Service Account Credentials
        // This client verifies world state and provides user ID mappings
        // CRITICAL: We need authenticated access to reliably detect world state
        // and populate the cache with user IDs for subsequent user logins.
        this.systemClient = new SocketFoundryClient(config);
    }

    public async initialize() {
        logger.info('SessionManager | Initializing System Client (Service Account)...');
        try {
            // Connect and authenticate with service account
            await this.systemClient.connect();

            // If credentials are provided, login to verify world state
            if (this.config.username && this.config.password) {
                await this.systemClient.login(this.config.username, this.config.password);
                logger.info('SessionManager | System Client authenticated successfully.');
            } else {
                logger.warn('SessionManager | No service account credentials provided. Running in guest mode (limited functionality).');
            }
        } catch (e: any) {
            logger.error(`SessionManager | System Client failed to initialize: ${e.message}`);
        }
    }

    /**
     * Returns the System Client (Authenticated Service Account)
     * Used for world verification and user discovery
     */
    public getSystemClient(): SocketFoundryClient {
        return this.systemClient;
    }

    /**
     * Creates a new authenticated session for a user.
     * Spawns a dedicated SocketClient.
     */
    public async createSession(username: string, password?: string): Promise<{ sessionId: string, userId: string }> {
        logger.info(`SessionManager | Creating session for user: ${username}`);

        // 1. Create new Client
        const client = new SocketFoundryClient({
            ...this.config,
            username,
            password
        });

        // 2. Connect & Authenticate
        try {
            await client.connect();
            await client.login(username, password);

            if (!client.userId) {
                throw new Error('Login failed: No User ID returned.');
            }

            // 3. Generate Session ID
            const sessionId = randomUUID();

            // 4. Store Session
            this.sessions.set(sessionId, {
                id: sessionId,
                client,
                userId: client.userId,
                username,
                lastActive: Date.now()
            });

            logger.info(`SessionManager | Session created: ${sessionId} (User: ${username})`);
            return { sessionId, userId: client.userId };

        } catch (e: any) {
            logger.error(`SessionManager | Failed to create session: ${e.message}`);
            client.disconnect(); // Cleanup
            throw e;
        }
    }

    /**
     * Retrieves an active session by ID.
     * Updates lastActive timestamp.
     */
    public getSession(sessionId: string): Session | undefined {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActive = Date.now();
        }
        return session;
    }

    /**
     * Terminates a session and cleans up resources.
     */
    public async destroySession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            logger.info(`SessionManager | Destroying session: ${sessionId}`);
            await session.client.logout();
            // logout() calls disconnect(), but we ensure it here
            session.client.disconnect();
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Returns true if a session is valid.
     */
    public isValidSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }
}
