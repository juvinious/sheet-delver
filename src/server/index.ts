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
import { registerUtilityRoutes } from './routes/protected/registerUtilityRoutes';
import { registerDebugRoutes } from './routes/debug/registerDebugRoutes';
import { createModuleRouter } from './routes/modules/createModuleRouter';
import { createAdminRouter } from './routes/admin/createAdminRouter';
import { createStatusService } from './services/status/StatusService';
import { createActorNormalizationService } from './services/actors/ActorNormalizationService';
import { createSystemStatusBroadcaster } from './realtime/SystemStatusBroadcaster';
import { registerAppSocketGateway } from './realtime/AppSocketGateway';

import { loadConfig } from '@core/config';
import { logger } from '@shared/utils/logger';
import { initializeRegistry } from '@modules/registry/server';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { systemService } from '@core/system/SystemService';

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
    const corsOriginPolicy = config.security.cors.allowAllOrigins ? true : config.security.cors.allowedOrigins;

    const app = express();
    app.use(express.json({ limit: config.security.bodyLimit }));
    app.use(cors({ origin: corsOriginPolicy }));

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: {
            origin: corsOriginPolicy,
            methods: ["GET", "POST"]
        }
    });

    // DEBUG: Global Request Logger
    app.use((req, res, next) => {
        logger.debug(`[CoreService] INCOMING REQUEST: ${req.method} ${req.url}`);
        next();
    });

    // Initialize Session Manager with Service Account
    const { SessionManager } = await import('@core/session/SessionManager');
    const sessionManager = new SessionManager({
        ...config.foundry
    });

    // Start System Provider
    await systemService.initialize(config.foundry);

    // Status read-model service: centralizes payload shaping used by REST and socket status flows.
    const statusService = createStatusService({ config, sessionManager });
    const { getSystemStatusPayload } = statusService;

    // Realtime status broadcaster: centralizes event-driven and polled systemStatus pushes.
    const systemStatusBroadcaster = createSystemStatusBroadcaster({ io, getSystemStatusPayload });
    const { broadcastSystemStatus } = systemStatusBroadcaster;
    systemStatusBroadcaster.registerLifecycleBroadcasts();

    // App socket gateway: auth middleware + per-connection listener lifecycle.
    registerAppSocketGateway({ io, sessionManager, getSystemStatusPayload, broadcastSystemStatus });

    // Initialize Session storage in background
    sessionManager.initialize().catch(err => {
        logger.error(`Core Service | SessionManager initialization failed: ${err.message}`);
    });

    // --- Backend Status Polling Loop ---
    systemStatusBroadcaster.startPolling(4000);

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

    // Public endpoints: status, config, registry, and auth session lifecycle.
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

    // Shared actor presentation service: centralizes normalization used across route domains.
    const actorNormalizationService = createActorNormalizationService();
    const { normalizeActors } = actorNormalizationService;

    // --- Protected Routes (Require Valid Session) ---
    appRouter.use(authenticateSession);

    // Protected system endpoints used by the dashboard shell and scene/system bootstrap.
    registerSystemRoutes(appRouter);

    // Protected actor endpoints for listing, cards, CRUD, rolls, and item operations.
    registerActorRoutes(appRouter, {
        normalizeActors,
        config
    });

    if (config.debug.enabled) {
        // Debug endpoint for direct actor inspection with required session token.
        registerDebugRoutes(app, {
            getOrRestoreSession: (token) => sessionManager.getOrRestoreSession(token)
        });
    } else {
        logger.info('Core Service | Debug routes disabled (debug.enabled=false).');
    }

    // Protected chat endpoints for feed retrieval and message send operations.
    registerChatRoutes(appRouter, { config });

    // Protected combat endpoints for combat state reads and initiative/turn controls.
    registerCombatRoutes(appRouter, { normalizeActors });

    // Protected journal CRUD endpoints.
    registerJournalRoutes(appRouter);

    // Protected utility endpoints shared by dashboard features.
    registerUtilityRoutes(appRouter);

    // Module proxy router for system-specific API handlers with permissive try-auth.
    const moduleRouter = createModuleRouter(tryAuthenticateSession);

    // Localhost-restricted admin router for status and world lifecycle operations.
    const adminRouter = createAdminRouter({ getSystemStatusPayload });


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
