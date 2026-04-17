import express from 'express';
import cors from 'cors';
import { createAuthenticateSession } from './middleware/authenticateSession';
import { createTryAuthenticateSession } from './middleware/tryAuthenticateSession';
import { createEnsureInitialized } from './middleware/ensureInitialized';
import { createLoginLimiter } from './middleware/rateLimiters';
import { registerPublicRoutes } from './routes/public/registerPublicRoutes';

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

    // --- System API (now protected by middleware) ---
    appRouter.get('/system', async (req, res) => {
        try {
            // Auth handled by middleware
            const gameData = systemService.getSystemClient().getGameData();
            res.json(gameData?.system || {});
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // System Data (Already has ensureInitialized via router.use)
    appRouter.get('/system/data', async (req: any, res: any) => {
        try {
            // Auth handled by middleware
            const systemClient = systemService.getSystemClient();
            const gameData = systemClient.getGameData();
            const { getAdapter } = await import('@modules/registry/server');
            const adapter = await getAdapter(gameData.system.id);
            const adapterName = adapter?.constructor?.name || 'Unknown';

            if (adapter && typeof (adapter as any).getSystemData === 'function') {
                const data = await (adapter as any).getSystemData(systemClient);
                logger.debug(`[CoreService] [PID:${process.pid}] System data fetched (${adapterName}). Keys: ${Object.keys(data || {}).length}`);
                res.json(data);
            } else {
                // Fallback: Return raw scraper data if adapter doesn't provide more
                res.json(gameData?.data || {});
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/system/scenes', async (req, res) => {
        try {
            // Auth handled by middleware
            const systemClient = systemService.getSystemClient();
            const sceneData = systemClient.getSceneData();

            if (!sceneData) {
                return res.status(404).json({ error: 'Scene data not available' });
            }

            res.json(sceneData);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });


    appRouter.get('/actors', async (req, res) => {
        try {
            const client = (req as any).foundryClient;

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

            const rawActors = await client.getActors();

            // Filter is handled by Foundry permission naturally for the user?
            // Yes, standard User can only see what they own/observe.
            // Client.getActors() returns what the socket gives.

            const normalize = async (actorList: any[]) => normalizeActors(actorList, client);

            // We treat all returned actors as "visible"
            // Filter by ownership and type
            const currentUserId = client.userId;

            // DEBUG: Log actor types to identify NPC patterns
            const actorTypes = new Set(rawActors.map((a: any) => a.type));
            const actorFolders = new Set(rawActors.map((a: any) => a.folder).filter(Boolean));
            logger.info(`Core Service | Actor types found: ${Array.from(actorTypes).join(', ')}`);
            logger.info(`Core Service | Actor folders found: ${Array.from(actorFolders).join(', ')}`);
            // logger.info(`Core Service | Sample actor: ${JSON.stringify(rawActors[0] || {}).substring(0, 300)}`);

            // Owned actors (ownership level 3 = OWNER)
            const owned = rawActors.filter((a: any) =>
                a.ownership?.[currentUserId!] === 3 || a.ownership?.default === 3
            );

            // Observable actors (ownership level 1 or 2 = LIMITED/OBSERVER)
            // EXCLUDE NPCs/monsters - only show player characters
            const observable = rawActors.filter((a: any) => {
                const isOwned = owned.includes(a);
                if (isOwned) return false;

                const userPermission = a.ownership?.[currentUserId!] || a.ownership?.default || 0;
                const isObservable = userPermission >= 1; // LIMITED or OBSERVER

                // CRITICAL: Exclude NPCs - Systems often use 'npc', 'monster', or 'vehicle' types
                const actorType = (a.type || '').toLowerCase();
                const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';

                return isObservable && !isNPC;
            });

            // Also filter NPCs from owned list for non-GM users
            const ownedCharacters = owned.filter((a: any) => {
                const actorType = (a.type || '').toLowerCase();
                const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';
                return !isNPC;
            });

            logger.info(`Core Service | Filtered actors - Owned: ${ownedCharacters.length}, Observable: ${observable.length}, Total raw: ${rawActors.length}`);

            res.json({
                actors: await normalize(ownedCharacters), // Legacy field
                ownedActors: await normalize(ownedCharacters),
                readOnlyActors: await normalize(observable),
                system: systemInfo.id
            });
        } catch (error: any) {
            logger.error(`Core Service | Actors fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/cards', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter || !adapter.getActorCardData) {
                return res.json({});
            }

            const rawActors = await client.getActors();
            const cards: Record<string, any> = {};

            for (const actor of rawActors) {
                const id = actor._id || actor.id;
                cards[id] = adapter.getActorCardData(actor);
            }

            res.json(cards);
        } catch (error: any) {
            logger.error(`Core Service | Actor cards bulk fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/:id/card', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor || actor.error) {
                return res.status(actor?.error ? 503 : 404).json({ error: actor?.error || 'Actor not found' });
            }

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter || !adapter.getActorCardData) {
                return res.json({});
            }

            res.json(adapter.getActorCardData(actor));
        } catch (error: any) {
            logger.error(`Core Service | Actor card fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor || actor.error) {
                return res.status(actor?.error ? 503 : 404).json({ error: actor?.error || 'Actor not found' });
            }

            const { CompendiumCache } = await import('@core/foundry/compendium-cache');
            const cache = CompendiumCache.getInstance();
            // Note: CompendiumCache is now initialized by SessionManager on startup.

            // Recursively resolve UUIDs
            const resolveUUIDs = (obj: any): any => {
                if (typeof obj === 'string') {
                    if (obj.startsWith('Compendium.')) {
                        const name = cache.getName(obj);
                        return name || obj;
                    }
                    return obj;
                }
                if (Array.isArray(obj)) return obj.map(item => resolveUUIDs(item));
                if (typeof obj === 'object' && obj !== null) {
                    const newObj: any = {};
                    for (const key in obj) newObj[key] = resolveUUIDs(obj[key]);
                    return newObj;
                }
                return obj;
            };

            const resolvedActor = resolveUUIDs(actor);

            // Priority: Use the current world's system adapter to avoid cross-system contamination
            const systemInfo = await client.getSystem();
            let adapter = await getAdapter(systemInfo.id);

            // Fallback: If world adapter doesn't match this specific actor, try heuristic matching
            const { getMatchingAdapter } = await import('@modules/registry/server');
            if (!adapter || (adapter.match && !adapter.match(resolvedActor))) {
                adapter = await getMatchingAdapter(resolvedActor);
            }

            const normalizedActor = adapter.normalizeActorData(resolvedActor, client);

            // Call adapter.computeActorData if available (module-specific derived stats)
            if (adapter.computeActorData) {
                normalizedActor.derived = {
                    ...(normalizedActor.derived || {}),
                    ...adapter.computeActorData(normalizedActor)
                };
            }

            // Call adapter.categorizeItems if available (module-specific item grouping)
            if (adapter.categorizeItems) {
                normalizedActor.categorizedItems = adapter.categorizeItems(normalizedActor);
            }

            if (normalizedActor.img) {
                normalizedActor.img = client.resolveUrl(normalizedActor.img);
            }
            if (normalizedActor.prototypeToken?.texture?.src) {
                normalizedActor.prototypeToken.texture.src = client.resolveUrl(normalizedActor.prototypeToken.texture.src);
            }

            res.json({
                ...normalizedActor,
                foundryUrl: client.url,
                systemId: adapter.systemId,
                debugLevel: config.debug?.level ?? 1
            });
        } catch (error: any) {
            logger.error(`Core Service | Actor detail fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    // Create new actor
    appRouter.post('/actors', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actorData = req.body;

            // Global Sanitization for items
            if (actorData.items && Array.isArray(actorData.items)) {
                actorData.items.forEach((item: any) => {
                    // 1. Top-level effects sanitization
                    if (item.effects && Array.isArray(item.effects)) {
                        if (item.effects.length > 0 && typeof item.effects[0] === 'string') {
                            logger.warn(`Core Service | Clearing invalid string effects for ${item.name} during creation`);
                            item.effects = [];
                        }
                    }

                    // 2. Remove problematic arrays in system
                    if (item.system) {
                        for (const key of Object.keys(item.system)) {
                            if (Array.isArray(item.system[key]) && (item.system[key].length === 0 || typeof item.system[key][0] === 'string')) {
                                delete item.system[key];
                            }
                        }
                    }
                });
            }

            logger.debug('Core Service | Create Actor:', actorData);
            const newActor = await client.createActor(actorData);

            // Handle potential error from socket
            if (!newActor) throw new Error("Failed to create actor");

            res.json({ success: true, id: newActor._id || newActor.id, actor: newActor });
        } catch (error: any) {
            logger.error(`Core Service | Create Actor failed: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            await client.deleteActor(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            const msg = error.message || error.toString();
            if (msg.toLowerCase().includes('permission')) {
                return res.json({ success: true, warning: 'Permission denied, actor may remain' });
            }
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.patch('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const result = await client.updateActor(req.params.id, req.body);
            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/roll', async (req, res) => {
        try {
            const client = (req as any).foundryClient;

            const { type, key, options } = req.body;
            const actor = await client.getActor(req.params.id);
            if (!actor) return res.status(404).json({ error: 'Actor not found' });

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

            if (type === 'use-item') {
                // key may be an item ID or an item name (from generic feat routing fallback)
                let itemId = key;
                const isId = actor.items?.some((i: any) => (i._id || i.id) === key);
                if (!isId) {
                    // Try to resolve by name across all item arrays
                    const allItems = [
                        ...(actor.items || []),
                        ...(actor.categorizedItems?.feats || []),
                        ...(actor.categorizedItems?.uncategorized || [])
                    ];
                    const found = allItems.find((i: any) => i.name === key);
                    if (found) itemId = found._id || found.id;
                }
                const result = await client.useItem(req.params.id, itemId);
                return res.json({ success: true, result });
            }

            let rollData;
            if (type === 'formula') {
                rollData = { formula: key, label: 'Custom Roll' };
            } else {
                rollData = adapter.getRollData(actor, type, key, options);
            }

            if (!rollData) throw new Error('Cannot determine roll formula');

            // Handle Automated Roll Sequences — adapter signals this via isAutomated: true.
            // All system-specific dispatch logic (feats, decoctions, etc.) lives in performAutomatedSequence.
            if (rollData.isAutomated && typeof adapter.performAutomatedSequence === 'function') {
                const result = await adapter.performAutomatedSequence(client, actor, rollData, options);
                return res.json({ success: true, result, label: rollData.label });
            }

            // Fallback: Standard formula roll — require a formula or abort
            if (!rollData.formula) {
                throw new Error(`No roll formula for type "${type}" key "${key}"`);
            }

            // Determine speaker
            const speaker = options?.speaker || {
                actor: actor._id || actor.id,
                alias: actor.name
            };

            const result = await client.roll(rollData.formula, rollData.label, {
                rollMode: options?.rollMode,
                speaker: speaker,
                flags: rollData.flags
            });
            res.json({ success: true, result, label: rollData.label });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const newItemId = await client.createActorItem(req.params.id, req.body);
            res.json({ success: true, id: newItemId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.put('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            await client.updateActorItem(req.params.id, req.body);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const itemId = req.query.itemId as string;
            if (!itemId) return res.status(400).json({ success: false, error: 'Missing itemId' });
            await client.deleteActorItem(req.params.id, itemId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });



    appRouter.post('/actors/:id/update', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actorId = req.params.id;
            const body = req.body;

            const actorUpdates: any = {};
            const itemUpdates: Map<string, any> = new Map();

            // Normalize body to an object of path-value pairs
            let updatesToProcess: any = {};
            if (body.path !== undefined && body.value !== undefined) {
                updatesToProcess[body.path] = body.value;
            } else {
                updatesToProcess = body;
            }

            // Split updates into Actor-level and Item-level
            for (const [path, value] of Object.entries(updatesToProcess)) {
                if (path.startsWith('items.')) {
                    const parts = path.split('.');
                    if (parts.length >= 2) {
                        const itemId = parts[1];
                        // Extract property path relative to item (e.g., "system.equipped")
                        const itemProp = parts.slice(2).join('.');
                        if (itemProp) {
                            if (!itemUpdates.has(itemId)) itemUpdates.set(itemId, {});
                            itemUpdates.get(itemId)![itemProp] = value;
                        }
                    }
                } else {
                    actorUpdates[path] = value;
                }
            }

            // 1. Process Item Updates
            for (const [itemId, updates] of itemUpdates.entries()) {
                logger.debug(`Core Service | Routing update to item ${itemId}: ${JSON.stringify(updates)}`);
                await client.updateActorItem(actorId, { _id: itemId, ...updates });
            }

            // 2. Process Actor Updates
            if (Object.keys(actorUpdates).length > 0) {
                await client.updateActor(actorId, actorUpdates);
            }

            res.json({ success: true });
        } catch (error: any) {
            logger.error(`Core Service | Actor/Item update failed: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });     /*
        export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
    ) {
    const { id } = await params;
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json(
                { error: 'Not connected to Foundry' },
                { status: 503 }
            );
        }
    
        const body = await request.json();
    
        const result = await client.updateActor(id, body);
    
        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }
    
        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
    }
        */


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


    appRouter.get('/chat', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const limit = parseInt(req.query.limit as string) || config.app.chatHistory || 100;
            const messages = await client.getChatLog(limit);
            res.json({ messages });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/chat/send', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'Message is empty' });

            const ROLL_CMD = /^\/(r|roll|gmr|gmroll|br|blindroll|sr|selfroll)(?=\s|$|\d)/i;
            const match = message.trim().match(ROLL_CMD);

            if (match) {
                const cmd = match[1].toLowerCase();
                // Determine roll mode from command if explicit, otherwise use body value
                let rollMode = req.body.rollMode;
                if (cmd === 'gmr' || cmd === 'gmroll') rollMode = 'gmroll';
                if (cmd === 'br' || cmd === 'blindroll') rollMode = 'blindroll';
                if (cmd === 'sr' || cmd === 'selfroll') rollMode = 'selfroll';
                if (cmd === 'r' || cmd === 'roll') rollMode = 'publicroll';

                // Strip the command prefix so Roll class gets a clean formula
                const cleanFormula = message.trim().replace(ROLL_CMD, '').trim();
                const result = await client.roll(cleanFormula, undefined, {
                    rollMode: rollMode,
                    speaker: req.body.speaker
                });
                res.json({ success: true, type: 'roll', result });
            } else {
                await client.sendMessage(message, {
                    rollMode: req.body.rollMode,
                    speaker: req.body.speaker
                });
                res.json({ success: true, type: 'chat' });
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/combats', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combats = await client.getCombats();

            // Consolidate actor fetching to avoid N+1 requests from frontend
            const enrichedCombats = await Promise.all(combats.map(async (combat: any) => {
                const actorIds = [...new Set((combat.combatants || []).map((c: any) => c.actorId).filter(Boolean))];
                const actorsMap: Record<string, any> = {};

                // Fetch all unique actors in this combat
                await Promise.all(actorIds.map(async (id: any) => {
                    try {
                        const actor = await client.getActor(id);
                        if (actor) actorsMap[id] = actor;
                    } catch (e) {
                        logger.error(`Failed to fetch actor ${id} for combat ${combat._id}`);
                    }
                }));

                // Attach actor data to combatants (Normalized for HUD requirements)
                const actorsToNormalize = Object.values(actorsMap).filter(Boolean);
                const normalizedActors = await normalizeActors(actorsToNormalize, client);
                const normalizedMap: Record<string, any> = {};
                normalizedActors.forEach((a: any) => {
                    const id = a._id || a.id;
                    normalizedMap[id] = a;
                });

                const enrichedCombatants = (combat.combatants || []).map((c: any) => ({
                    ...c,
                    actor: normalizedMap[c.actorId] || null
                }));

                return { ...combat, combatants: enrichedCombatants };
            }));

            res.json({ success: true, combats: enrichedCombats });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    const isAuthorizedForCombatTurn = async (client: any, combat: any, userId: string): Promise<boolean> => {
        const users = await client.getUsers();
        const user = users.find((u: any) => (u._id || u.id) === userId);
        const isGM = (user?.role || user?.permissions?.role || 0) >= 3;
        if (isGM) return true;

        // Check if the current turn's combatant belongs to an actor owned by the user
        const currentTurn = combat.turn ?? 0;
        const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
            const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
            const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
            return (ib - ia) || (a._id > b._id ? 1 : -1);
        });

        const activeCombatant = sortedCombatants[currentTurn];
        if (!activeCombatant || !activeCombatant.actorId) return false;

        const actor = await client.getActor(activeCombatant.actorId);
        if (!actor) return false;

        // Foundry ownership check: 3 is OWNER
        const ownership = actor.ownership?.[userId] || actor.permission?.[userId] || 0;
        return ownership >= 3;
    };

    appRouter.post('/combats/:id/next-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;

            // Fetch the specific combat to get current turn/round
            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);

            if (!combat) {
                return res.status(404).json({ error: 'Combat not found' });
            }

            if (!(await isAuthorizedForCombatTurn(client, combat, client.userId))) {
                return res.status(403).json({ error: 'Unauthorized: You do not own the current combatant and are not a GM' });
            }

            // Mimic Foundry's turn logic: sort by initiative desc, tie-break by ID
            const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
                const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
                const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
                return (ib - ia) || (a._id > b._id ? 1 : -1);
            });

            let currentRound = combat.round || 0;
            let currentTurn = combat.turn ?? -1;

            if (currentRound === 0) {
                currentRound = 1;
                currentTurn = 0;
            } else {
                currentTurn += 1;
                if (currentTurn >= sortedCombatants.length) {
                    currentRound += 1;
                    currentTurn = 0;
                }
            }

            await client.dispatchDocumentSocket('Combat', 'update', {
                updates: [{ _id: combatId, round: currentRound, turn: currentTurn }]
            });

            res.json({ success: true, round: currentRound, turn: currentTurn });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/previous-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;

            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);

            if (!combat) {
                return res.status(404).json({ error: 'Combat not found' });
            }

            const users = await client.getUsers();
            const user = users.find((u: any) => (u._id || u.id) === client.userId);
            const isGM = (user?.role || user?.permissions?.role || 0) >= 3;

            if (!isGM) {
                return res.status(403).json({ error: 'Unauthorized: Only GMs can move to previous turns' });
            }

            const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
                const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
                const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
                return (ib - ia) || (a._id > b._id ? 1 : -1);
            });

            let currentRound = combat.round || 0;
            let currentTurn = combat.turn ?? 0;

            if (currentRound === 0) {
                // Do nothing if not started
            } else if (currentTurn === 0) {
                if (currentRound > 1) {
                    currentRound -= 1;
                    currentTurn = Math.max(0, sortedCombatants.length - 1);
                } else {
                    currentRound = 0;
                    currentTurn = 0;
                }
            } else {
                currentTurn -= 1;
            }

            await client.dispatchDocumentSocket('Combat', 'update', {
                updates: [{ _id: combatId, round: currentRound, turn: currentTurn }]
            });

            res.json({ success: true, round: currentRound, turn: currentTurn });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/combatants/:combatantId/roll-initiative', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;
            const combatantId = req.params.combatantId;
            const { formula, advantageMode } = req.body;

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);
            if (!combat) return res.status(404).json({ error: 'Combat not found' });

            const combatant = combat.combatants?.find((c: any) => (c._id || c.id) === combatantId);
            if (!combatant) return res.status(404).json({ error: 'Combatant not found' });

            const actor = await client.getActor(combatant.actorId);
            if (!actor) return res.status(404).json({ error: 'Actor not found' });

            let finalFormula = formula;
            if (!finalFormula) {
                if (typeof (adapter as any).getInitiativeFormula === 'function') {
                    finalFormula = (adapter as any).getInitiativeFormula(actor);
                } else {
                    finalFormula = '1d20';
                }
            }

            // Apply ui-requested explicit advantage/disadvantage to standard D20 rolls
            if (advantageMode === 'advantage') {
                finalFormula = finalFormula.replace(/^(?:1d20|2d20k[hl]1)/i, '2d20kh1');
            } else if (advantageMode === 'disadvantage') {
                finalFormula = finalFormula.replace(/^(?:1d20|2d20k[hl]1)/i, '2d20kl1');
            } else if (advantageMode === 'normal') {
                finalFormula = finalFormula.replace(/^(?:2d20k[hl]1)/i, '1d20');
            }

            const speaker = {
                actor: actor._id || actor.id,
                alias: actor.name
            };

            const chatMessage = await client.roll(finalFormula, 'Initiative', { speaker });
            const total = parseInt(chatMessage.content);

            if (isNaN(total)) {
                throw new Error("Failed to parse roll total from chat message");
            }

            await client.dispatchDocumentSocket('Combatant', 'update', {
                updates: [{ _id: combatantId, initiative: total }]
            }, { type: 'Combat', id: combatId });

            res.json({ success: true, initiative: total });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /* TODO Add next or finish round if actorId matches current combatant.actorId */

    appRouter.get('/journals', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const currentUserId = client.userId;
            const allJournals = await client.getJournals();
            const allFolders = await client.getFolders('JournalEntry');

            const users = await client.getUsers();
            const currentUser = users.find((u: any) => (u._id || u.id) === currentUserId);
            const isGM = (currentUser?.role >= 3) || false;

            const visibleJournals = allJournals.filter((j: any) => {
                if (isGM) return true;
                const level = j.ownership?.[currentUserId] ?? j.ownership?.default ?? 0;
                return level >= 2; // Observer or better
            });

            // Filter folders: only show if they contain (directly or indirectly) a visible journal
            const getFolderIdsWithVisibleJournals = (): Set<string> => {
                const folderIds = new Set<string>();
                visibleJournals.forEach((j: any) => {
                    if (j.folder) {
                        let currentFolderId = j.folder;
                        while (currentFolderId) {
                            folderIds.add(currentFolderId);
                            const folder = allFolders.find((f: any) => f._id === currentFolderId);
                            currentFolderId = folder?.folder || null;
                        }
                    }
                });
                return folderIds;
            };

            const visibleFolderIds = getFolderIdsWithVisibleJournals();
            const visibleFolders = allFolders.filter((f: any) => isGM || visibleFolderIds.has(f._id));

            res.json({ journals: visibleJournals, folders: visibleFolders });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/journals', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type, data } = req.body; // type: 'JournalEntry' | 'Folder'
            const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'create', {
                data: [data], // Wrap in array as required by DatabaseBackend#create
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const uuid = req.params.id;
            const response = await client.dispatchDocumentSocket('JournalEntry', 'get', {
                query: { _id: uuid },
                broadcast: false
            });
            const doc = response.result?.[0];

            if (!doc) return res.status(404).json({ error: 'Journal not found' });
            res.json(doc);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.patch('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type, data } = req.body;
            const result = await client.dispatchDocumentSocket(type || 'JournalEntry', 'update', {
                updates: [{ ...data, _id: req.params.id }],
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.delete('/journals/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { type } = req.query;
            const result = await client.dispatchDocumentSocket((type as string) || 'JournalEntry', 'delete', {
                ids: [req.params.id],
                broadcast: true
            });
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

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
