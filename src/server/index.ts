import express from 'express';
import cors from 'cors';
import { createAuthenticateSession } from './middleware/authenticateSession';
import { createTryAuthenticateSession } from './middleware/tryAuthenticateSession';
import { createEnsureInitialized } from './middleware/ensureInitialized';
import { createLoginLimiter } from './middleware/rateLimiters';
import { registerPublicRoutes } from './routes/public/registerPublicRoutes';
import { registerActorRoutes } from './routes/protected/registerActorRoutes';
import { registerChatRoutes } from './routes/protected/registerChatRoutes';
import { registerCombatRoutes } from './routes/protected/registerCombatRoutes';
import { registerSystemRoutes } from './routes/protected/registerSystemRoutes';
import { registerJournalRoutes } from './routes/protected/registerJournalRoutes';

import { getMatchingAdapter } from '@modules/registry/server';
import { loadConfig, getConfig } from '@core/config';
import { logger } from '@shared/utils/logger';
import { getAdapter, initializeRegistry, unloadSystemModules, getRegisteredModules, getServerModule } from '@modules/registry/server';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { systemService } from '@core/system/SystemService';
import { SetupManager } from './core/foundry/SetupManager';

async function startServer() {
    const config = await loadConfig();
    if (!config) {
        logger.error('Core Service | Could not load configuration. Exiting.');
        process.exit(1);
    }

    // Initialize Universal Logger with configured level
    logger.setLevel(config.debug.level);
    logger.info(`Core Service | Logger initialized at level: ${config.debug.level}`);

    // Boot-Time System Discovery
    initializeRegistry();

    // Global Error Handlers (Diagnostic for silent kills/crashes)
    if (config.debug.level >= 4) {
        process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            logger.error(`\x1b[31m[FATAL] Unhandled Rejection at: ${promise} reason: ${reason?.stack || reason}\x1b[0m`);
            process.exit(1);
        });

        process.on('uncaughtException', (err: Error) => {
            logger.error(`\x1b[31m[FATAL] Uncaught Exception: ${err.stack || err}\x1b[0m`);
            process.exit(1);
        });
    }

    const { apiPort } = config.app;
    const corePort = process.env.PORT ? parseInt(process.env.PORT) : (process.env.API_PORT ? parseInt(process.env.API_PORT) : apiPort);

    const app = express();
    app.use(express.json({ limit: config.security.bodyLimit }));
    app.use(cors());

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Setup Socket.io Middleware
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            // Unauthenticated connection (Guest) - only receives global system status
            return next();
        }

        try {
            const session = await sessionManager.getOrRestoreSession(token);
            if (!session || !session.client.userId) {
                // Invalid token, but still allow guest connection
                return next();
            }
            // Attach session/client to socket for later use
            (socket as any).userSession = session;
            (socket as any).foundryClient = session.client;

            // Join authenticated room for sensitive updates (actors, chat, combat, shared content)
            socket.join('authenticated');
            next();
        } catch (err) {
            next(); // Degrade to guest
        }
    });

    logger.info('Core Service | Socket.io server initialized with secure middleware');

    // Handle App Socket Connections
    io.on('connection', async (socket) => {
        const clientCount = io.engine.clientsCount;
        logger.debug(`App Socket | Client connected: ${socket.id} (Total: ${clientCount}, Auth: ${socket.rooms.has('authenticated')})`);

        // Inform SystemService of engagement for adaptive heartbeat
        systemService.getSystemClient().updateActiveBrowserCount(clientCount);

        // Initial setup for this specific socket connection
        const payload = await getSystemStatusPayload();
        socket.emit('systemStatus', payload);

        // Attach listeners to individual foundry client for sensitive/per-user data
        const foundryClient = (socket as any).foundryClient;
        if (foundryClient) {
            logger.info(`App Socket | Attaching per-user listeners for ${foundryClient.username} (${socket.id})`);

            const handleCombatUpdate = (data: any) => socket.emit('combatUpdate', data);
            const handleChatUpdate = (data: any) => socket.emit('chatUpdate', data);
            const handleActorUpdate = (data: any) => socket.emit('actorUpdate', data);
            const handleSharedUpdate = (data: any) => socket.emit('sharedContentUpdate', data);

            foundryClient.on('combatUpdate', handleCombatUpdate);
            foundryClient.on('chatUpdate', handleChatUpdate);
            foundryClient.on('actorUpdate', handleActorUpdate);
            foundryClient.on('sharedContentUpdate', handleSharedUpdate);

            // New relays for world lifecycle and system status
            foundryClient.on('systemStatusUpdate', broadcastSystemStatus);
            foundryClient.on('worldShutdown', broadcastSystemStatus);
            foundryClient.on('worldReload', broadcastSystemStatus);

            socket.on('disconnect', () => {
                const remaining = io.engine.clientsCount;
                logger.debug(`App Socket | Client disconnected: ${socket.id}. Remaining: ${remaining}`);
                systemService.getSystemClient().updateActiveBrowserCount(remaining);

                foundryClient.off('combatUpdate', handleCombatUpdate);
                foundryClient.off('chatUpdate', handleChatUpdate);
                foundryClient.off('actorUpdate', handleActorUpdate);
                foundryClient.off('sharedContentUpdate', handleSharedUpdate);
                foundryClient.off('systemStatusUpdate', broadcastSystemStatus);
                foundryClient.off('worldShutdown', broadcastSystemStatus);
                foundryClient.off('worldReload', broadcastSystemStatus);
            });
        } else {
            socket.on('disconnect', () => {
                const remaining = io.engine.clientsCount;
                logger.debug(`App Socket | Client disconnected: ${socket.id}. Remaining: ${remaining}`);
                systemService.getSystemClient().updateActiveBrowserCount(remaining);
            });
        }
    });

    // DEBUG: Global Request Logger
    app.use((req, res, next) => {
        logger.debug(`[CoreService] INCOMING REQUEST: ${req.method} ${req.url}`);
        next();
    });

    // Initialize Session Manager with Service Account
    const { SessionManager } = await import('@core/session/SessionManager');
    const { UserRole } = await import('@shared/constants');
    const sessionManager = new SessionManager({
        ...config.foundry
    });

    // Start System Provider
    await systemService.initialize(config.foundry);
    const systemClient = systemService.getSystemClient();

    // --- Global Status Payload Generator ---
    const getSystemStatusPayload = async () => {
        const systemClient = systemService.getSystemClient();
        let system: any = {
            id: null,
            status: systemClient.worldState,
            worldTitle: 'Reconnecting...'
        };
        let users = [];
        try {
            const gameData = systemClient.getGameData();
            if (gameData) {
                const usersList = gameData.users || [];
                const activeCount = usersList.filter((u: any) => u.active).length;
                const totalCount = usersList.length;

                system = {
                    ...gameData.system,
                    appVersion: config.app.version,
                    worldTitle: gameData.world?.title || 'Foundry VTT',
                    worldDescription: gameData.world?.description,
                    worldBackground: systemClient.resolveUrl(gameData.world?.background),
                    background: systemClient.resolveUrl(
                        gameData.system?.background ||
                        gameData.system?.worldBackground ||
                        (() => {
                            const sceneData = (systemClient as any).sceneDataCache;
                            return sceneData?.NUEDEFAULTSCENE0?.background?.src;
                        })()
                    ),
                    nextSession: gameData.world?.nextSession,
                    status: systemClient.worldState === 'active' ? 'active' : systemClient.worldState,
                    actorSyncToken: (systemClient as any).lastActorChange,
                    users: { active: activeCount, total: totalCount }
                };
                users = usersList;
            } else {
                // No full game data available yet.
                // If the probe discovered the world (service account missing), surface that info.
                const probeData = (systemClient as any).probeWorldData;
                if (probeData) {
                    system.worldTitle = probeData.title || system.worldTitle;
                    system.worldDescription = probeData.description || null;
                    // Surface user count discovered by the guest probe
                    const userMapSize = (systemClient as any).userMap?.size || 0;
                    system.users = { active: 0, total: userMapSize };
                }
                system.appVersion = config.app.version;
            }

            if (system.id) {
                const sid = system.id.toLowerCase();
                const adapter = await getAdapter(sid);
                if (adapter && typeof (adapter as any).getConfig === 'function') {
                    const cfg = (adapter as any).getConfig();
                    if (cfg) system.config = cfg;
                }
            }
        } catch { /* Suppress */ }

        // Centralized User Sanitization Helper
        const sanitizeUser = (u: any, client: any) => ({
            _id: u._id || u.id,
            name: u.name,
            role: u.role,
            isGM: u.role >= UserRole.ASSISTANT,
            active: u.active,
            color: u.color,
            characterId: u.character,
            img: client.resolveUrl(u.avatar || u.img)
        });

        const sanitizedUsers = users?.length > 0 ? users.map((u: any) => sanitizeUser(u, systemClient)) : [];

        return {
            connected: systemClient.isConnected,
            worldId: systemClient.getGameData()?.world?.id || null,
            initialized: sessionManager.isCacheReady(),
            isConfigured: !!(systemClient.cachedWorldData || (await SetupManager.loadCache()).currentWorldId),
            users: sanitizedUsers,
            system: system,
            url: config.foundry.url,
            appVersion: config.app.version,
            debug: config.debug
        };
    };

    // Global System Status Broadcast System
    // This pushes updates to ALL dashboard clients whenever the target world state changes.
    const broadcastSystemStatus = async () => {
        const payload = await getSystemStatusPayload();
        io.emit('systemStatus', payload);
    };

    systemService.on('world:connected', (data) => {
        logger.info(`Core Service | World Connected [${data.state}]. Broadcasting status to clients...`);
        broadcastSystemStatus();
    });

    systemService.on('world:disconnected', () => {
        logger.info('Core Service | World Disconnected. Broadcasting status to clients...');
        broadcastSystemStatus();
    });

    systemService.on('world:ready', (data) => {
        logger.info(`Core Service | World Ready [${data.systemId}]. Broadcasting status to clients...`);
        broadcastSystemStatus();
    });

    // Initialize Session storage in background
    sessionManager.initialize().catch(err => {
        logger.error(`Core Service | SessionManager initialization failed: ${err.message}`);
    });

    // --- Backend Status Polling Loop ---
    setInterval(async () => {
        const payload = await getSystemStatusPayload();
        io.emit('systemStatus', payload);
    }, 4000);

    // --- Middleware: Session Authentication ---
    const authenticateSession = createAuthenticateSession(sessionManager, config);

    // --- Middleware: Optional Session Authentication (Try-Auth) ---
    const tryAuthenticateSession = createTryAuthenticateSession(sessionManager, config);

    // --- Rate Limiting (Configurable) ---
    const loginLimiter = createLoginLimiter(config);

    // --- App API (Public/Proxy-bound) ---
    // This API serves the frontend via the Next.js proxy
    const appRouter = express.Router();

    const statusHandler = async (req: express.Request, res: express.Response) => {
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // Check Auth for REST endpoint response
            let isAuthenticated = false;
            let userSession = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                userSession = await sessionManager.getOrRestoreSession(token);
                if (userSession && userSession.client.userId) {
                    isAuthenticated = true;
                }
            }

            const basePayload = await getSystemStatusPayload();

            res.json({
                ...basePayload,
                isAuthenticated,
                currentUserId: userSession?.userId || null
            });
        } catch (error: any) {
            logger.error(`Status Handler Error: ${error.message}`);
            res.status(500).json({ error: 'Failed to retrieve status' });
        }
    };

    // Middleware to check if system is initialized
    const ensureInitialized = createEnsureInitialized(sessionManager);

    const getSanitizedConfig = () => ({
        app: { version: config.app.version },
        foundry: {
            url: config.foundry.url
        }
    });

    registerPublicRoutes(appRouter, {
        statusHandler,
        getSanitizedConfig,
        loginLimiter,
        createSession: (username, password) => sessionManager.createSession(username, password),
        destroySession: (token) => sessionManager.destroySession(token)
    });

    // --- System API (moved after middleware to avoid duplicate auth) ---

    // --- Global Guard: Block API until bootstrap complete ---
    appRouter.use(ensureInitialized);

    // --- Normalized Data Helper ---
    // Shared between /api/actors and /api/combats to ensure UI-ready data
    const normalizeActors = async (actorList: any[], client: any) => {
        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

        const { CompendiumCache } = await import('@core/foundry/compendium-cache');
        const cache = CompendiumCache.getInstance();

        return Promise.all(actorList.map(async (actor: any) => {
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
            if (adapter.resolveActorNames) await adapter.resolveActorNames(actor, cache);

            // Resolve top-level image
            if (actor.img) actor.img = client.resolveUrl(actor.img);
            if (actor.prototypeToken?.texture?.src) {
                actor.prototypeToken.texture.src = client.resolveUrl(actor.prototypeToken.texture.src);
            }

            const normalized = adapter.normalizeActorData(actor, client);

            // Compute derived data if adapter supports it (for Dashboard stats)
            if (adapter.computeActorData) {
                normalized.derived = adapter.computeActorData(normalized);
            }

            return normalized;
        }));
    };

    // --- Protected Routes (Require Valid Session) ---
    appRouter.use(authenticateSession);

    registerSystemRoutes(appRouter);

    registerActorRoutes(appRouter, {
        normalizeActors,
        config
    });


    // Debug route - allow using system client if no session provided for easier dev access
    app.get('/api/debug/actor/:id', async (req, res) => {
        try {
            let client = systemService.getSystemClient();

            // Try to use user session if available for better data accuracy
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = await sessionManager.getOrRestoreSession(token);
                if (session) client = session.client as any;
            }

            const actor = await client.getActor(req.params.id);
            res.json(actor);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });


    registerChatRoutes(appRouter, { config });

    registerCombatRoutes(appRouter, { normalizeActors });

    registerJournalRoutes(appRouter);

    appRouter.get('/foundry/document', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const uuid = req.query.uuid as string;
            if (!uuid) return res.status(400).json({ error: 'Missing uuid' });

            // Use the new headless-compatible fetch method
            const data = await client.fetchByUuid(uuid);

            if (!data) return res.status(404).json({ error: 'Document not found' });
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });


    appRouter.get('/session/users', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            // Use System Client to fetch users (CoreSocket has the data methods)
            const users = await systemService.getSystemClient().getUsers();
            logger.debug(`[API] /session/users: Found ${users.length} users via System Client`);

            // Sanitize and Map (Consistent with statusHandler)
            const sanitizedUsers = users.map((u: any) => {
                return {
                    _id: u._id || u.id,
                    name: u.name,
                    role: u.role,
                    isGM: u.role >= UserRole.ASSISTANT, // Roles 3 & 4
                    active: u.active,
                    color: u.color,
                    characterId: u.character,
                    img: client.resolveUrl(u.avatar || u.img)
                };
            });

            res.json({ users: sanitizedUsers });
        } catch (error: any) {
            logger.error(`User Fetch Error: ${error.message}`);
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });

    // --- Shared Content API ---
    appRouter.get('/shared-content', (req, res) => {
        try {
            // CRITICAL: Use the *User's* client to strip out shared content relevant to THEM.
            // If the GM shares with "User A", only User A's socket receives the event.
            // The System Client (Service Account) would miss it unless it was the target or it was a broadcast.
            const client = (req as any).foundryClient || systemService.getSystemClient();

            // Note: SocketClient logic stores the last received 'shareImage'/'showEntry' event.
            // This works perfectly for the specific user's view.
            const content = (client as any).getSharedContent();

            // Resolve URLs in shared content
            if (content && content.type === 'image' && content.data?.url) {
                content.data.url = client.resolveUrl(content.data.url);
            }

            res.json(content || { type: null });
        } catch (error: any) {
            logger.error('Error fetching shared content:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // --- Module Router (Permissive Auth) ---
    // Mounted before the global auth middleware to allow module-specific permissive routes
    const moduleRouter = express.Router();
    moduleRouter.use(tryAuthenticateSession);

    // Express 5: String wildcards (*) must be named or used via RegExp. 
    // Named capturing groups (?<name>) populate req.params.name
    moduleRouter.all(/^(.*)$/, async (req, res) => {
        try {
            const parts = req.path.split('/').filter(Boolean);
            const systemId = parts[0];
            const routePath = parts.slice(1).join('/');

            if (!systemId) return res.status(404).json({ error: 'No system specified' });

            // Hard Wall: Dynamically import the server module directly from its folder.
            // Since this is in server/index.ts (run via ts-node), it is never bundled for the browser.
            // Correctly resolve the server module via the registry manifest
            const sysModule = await getServerModule(systemId);
            if (!sysModule) {
                logger.warn(`Module Routing | Module ${systemId} not found or missing server entry point.`);
                return res.status(404).json({ error: `Module ${systemId} not found` });
            }

            if (!sysModule || !sysModule.apiRoutes) {
                logger.warn(`Module Routing | Module ${systemId} missing apiRoutes.`);
                return res.status(404).json({ error: `Module ${systemId} API not available` });
            }

            let matchedPattern: string | undefined;
            // logger.error(`[DEBUG] Module Router | systemId: ${systemId}, routePath: ${routePath}`);
            const routes = Object.keys(sysModule.apiRoutes);

            for (const pattern of routes) {
                const regex = new RegExp('^' + pattern.replace(/\[.*?\]/g, '([^/]+)') + '$');
                const isMatch = regex.test(routePath);
                if (isMatch) {
                    matchedPattern = pattern;
                    break;
                }
            }

            if (!matchedPattern) {
                logger.warn(`Module Routing | No handler found for ${systemId}/${routePath}. Available routes: ${routes.join(', ')}`);
                logger.error(`[DEBUG] sysModule.apiRoutes keys for ${systemId}:`, Object.keys(sysModule.apiRoutes));
                return res.status(404).json({ error: `Route ${routePath} not found` });
            }

            const handler = sysModule.apiRoutes[matchedPattern];
            const nextRequest = {
                json: async () => req.body,
                method: req.method,
                url: req.url,
                headers: req.headers,
                foundryClient: (req as any).foundryClient || systemService.getSystemClient(),
                userSession: (req as any).userSession
            } as any;
            const nextParams = { params: Promise.resolve({ systemId, route: routePath.split('/') }) };

            logger.info(`Module Router | Calling handler for ${matchedPattern} with actorId: ${routePath.split('/')[1]}`);
            const result = await handler(nextRequest, nextParams);

            if (result && result.json) {
                const data = await result.json();
                return res.status(result.status || 200).json(data);
            }
            return res.json(result);
        } catch (error: any) {
            logger.error(`Module Routing Error (${req.path}): ${error.message}`);
            return res.status(500).json({ error: error.message });
        }
    });

    // --- Admin API (Local-Only) ---
    // This API is used by the standalone CLI tool
    const adminRouter = express.Router();

    // Verify local request
    adminRouter.use((req, res, next) => {
        const remoteAddress = req.socket.remoteAddress;
        if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') {
            logger.warn(`Core Service | Blocked non-local Admin API request from ${remoteAddress}`);
            return res.status(403).json({ error: 'Admin access restricted to localhost' });
        }
        next();
    });

    adminRouter.get('/status', async (req, res) => {
        // Use system client for admin status
        const systemStatus = await getSystemStatusPayload();
        const client = systemService.getSystemClient();
        res.json({
            ...systemStatus,
            socket: client.isConnected,
            worldState: (client as any).worldState,
            userId: client.userId,
            isExplicit: (client as any).isExplicitSession,
            discoveredUserId: (client as any).discoveredUserId
        });
    });

    adminRouter.get('/worlds', async (req, res) => {
        try {
            // Use system client
            const client = systemService.getSystemClient();
            // Try live system info first
            const { SetupManager } = await import('@core/foundry/SetupManager');
            let worlds: any[] = [];

            // If we have a URL, try to scrape available worlds
            // Note: SetupManager.scrapeAvailableWorlds is currently a placeholder returning []
            // but we keep the call structure for future expansion
            worlds = await SetupManager.scrapeAvailableWorlds(client.url || '');

            // Also check local cache
            if (worlds.length === 0) {
                const cache = await SetupManager.loadCache();
                if (cache.currentWorldId && cache.worlds[cache.currentWorldId]) {
                    worlds = [cache.worlds[cache.currentWorldId]];
                }
            }

            res.json(worlds);
        } catch (error) {
            logger.error('Failed to list worlds', error);
            res.status(500).json({ error: 'Failed to list worlds' });
        }
    });

    // Setup endpoints removed - functionality migrated to CLI admin tool


    adminRouter.get('/cache', async (req, res) => {
        try {
            const { SetupManager } = await import('@core/foundry/SetupManager');
            const cache = await SetupManager.loadCache();
            res.json(cache);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/setup/scrape', async (req, res) => {
        const { sessionCookie } = req.body;
        if (!sessionCookie) return res.status(400).json({ error: 'Session cookie required' });

        try {
            const { SetupManager } = await import('@core/foundry/SetupManager');
            const client = systemService.getSystemClient();
            logger.info(`Core Service | Triggering manual deep-scrape via CLI...`);

            // Scrape
            const result = await SetupManager.scrapeWorldData(client.url || '', sessionCookie);

            // Save to Cache
            await SetupManager.saveCache(result);

            // Re-connect client logic if needed (optional)
            // if (!client.isLoggedIn) client.connect(); 

            res.json({ success: true, data: result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/launch', async (req, res) => {
        const { worldId } = req.body;
        try {
            const client = systemService.getSystemClient();
            await client.launchWorld(worldId);
            res.json({ success: true, message: `Request to launch world ${worldId} sent.` });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/shutdown', async (req, res) => {
        try {
            const client = systemService.getSystemClient();
            await client.shutdownWorld();
            res.json({ success: true, message: 'Request to shut down current world sent.' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });


    // --- Mount Routers ---
    app.use('/api/modules', moduleRouter); // Mount before global auth middleware for permissive routes
    app.use('/api', appRouter);
    app.use('/admin', adminRouter);

    httpServer.listen(corePort, '0.0.0.0', () => {
        logger.info(`Core Service | Silent Daemon running on http://127.0.0.1:${corePort}`);
        logger.info(`Core Service | App API: http://127.0.0.1:${corePort}/api`);
        logger.info(`Core Service | Admin API: http://127.0.0.1:${corePort}/admin (Localhost Only)`);
    });
}

startServer().catch(err => {
    logger.error('Core Service | Unhandled startup error:', err);
    process.exit(1);
});
