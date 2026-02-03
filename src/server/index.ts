import express from 'express';
import cors from 'cors';
import { createFoundryClient } from '../core/foundry';
import { loadConfig } from '../core/config';
import { logger } from '../core/logger';
import { getAdapter, getConfig } from '../modules/core/registry';

async function startServer() {
    const config = await loadConfig();
    if (!config) {
        console.error('Core Service | Could not load configuration. Exiting.');
        process.exit(1);
    }

    const { host, port, apiPort } = config.app || { host: 'localhost', port: 3000, apiPort: 3001 };
    const corePort = process.env.API_PORT ? parseInt(process.env.API_PORT) : apiPort;

    const app = express();
    app.use(express.json());
    app.use(cors());

    // Initialize Session Manager with Service Account
    const { SessionManager } = await import('../core/session/SessionManager');
    const sessionManager = new SessionManager({
        ...config.foundry
        // Service account credentials from settings.yaml are used for system client
    });

    // Start Service Account Client for World Verification
    await sessionManager.initialize();

    // --- Middleware: Session Authentication ---
    const authenticateSession = (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // For now, fail open? No, strictly require session for data.
            // Exception: If we want to support the "Global Service Account" legacy mode...
            // User requested BYPASSING it. So strict error.
            return res.status(401).json({ error: 'Unauthorized: Missing Session Token' });
        }

        const sessionId = authHeader.split(' ')[1];

        // Use async restoration
        sessionManager.getOrRestoreSession(sessionId).then(session => {
            if (!session) {
                return res.status(401).json({ error: 'Unauthorized: Invalid or Expired Session' });
            }

            // Attach client to request
            (req as any).foundryClient = session.client;
            (req as any).userSession = session;
            next();
        }).catch(err => {
            logger.error(`Authentication Error: ${err.message}`);
            res.status(500).json({ error: 'Internal Authentication Error' });
        });
    };

    // --- App API (Public/Proxy-bound) ---
    // This API serves the frontend via the Next.js proxy
    const appRouter = express.Router();


    const statusHandler = async (req: express.Request, res: express.Response) => {
        try {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // Check if Request has a valid session
            let isAuthenticated = false;
            let userSession = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                userSession = await sessionManager.getOrRestoreSession(token);
                if (userSession) {
                    isAuthenticated = true;
                }
            }

            // Use User Session Client if authenticated, otherwise use System Client
            const client = userSession?.client || sessionManager.getSystemClient();

            // Optimistic System Fetch (if connected)
            let system, users;
            try {
                system = await client.getSystem();
                users = await client.getUsersDetails();

                // Add adapter config to system info (for actorCard.subtext, etc.)
                if (system?.id) {
                    const sid = system.id.toLowerCase();
                    logger.info(`Status Handler | Getting adapter for system: ${sid}`);
                    const adapter = getAdapter(sid);
                    if (adapter && typeof (adapter as any).getConfig === 'function') {
                        logger.info(`Status Handler | Adapter found, calling getConfig()`);
                        const config = (adapter as any).getConfig();
                        logger.info(`Status Handler | Adapter config: ${JSON.stringify(config || {}).substring(0, 200)}`);
                        if (config) {
                            system.config = config;
                            logger.info(`Status Handler | Added config to system info`);
                        }
                    } else {
                        logger.warn(`Status Handler | No adapter or getConfig for system: ${system.id}`);
                    }
                }
            } catch (e) {
                // If client isn't fully ready, use cached/default
            }

            const connected = client.isConnected;

            if (process.env.NODE_ENV !== 'production') {
                logger.debug(`Status Handler | Returning system: ${JSON.stringify(system || {}).substring(0, 500)}`);
            }

            res.json({
                connected,
                isAuthenticated,
                users: users || [],
                system: system || {},
                url: config.foundry.url,
                appVersion: '0.5.0'
            });
        } catch (error: any) {
            logger.error(`Status Handler Error: ${error.message}`);
            res.status(500).json({ error: 'Failed to retrieve status' });
        }
    };


    appRouter.get('/status', statusHandler);
    appRouter.get('/session/connect', statusHandler);

    // --- System API ---
    appRouter.get('/system', async (req, res) => {
        // Authenticate (using a common helper or inline)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.split(' ')[1];
        const session = await sessionManager.getOrRestoreSession(token);
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const systemInfo = await session.client.getSystem();
            res.json(systemInfo);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/system/data', async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.split(' ')[1];
        const session = await sessionManager.getOrRestoreSession(token);
        if (!session) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const client = session.client;
            const systemInfo = await client.getSystem();
            const adapter = getAdapter(systemInfo.id);

            if (adapter && typeof (adapter as any).getSystemData === 'function') {
                const data = await (adapter as any).getSystemData(client);
                res.json(data);
            } else {
                // Fallback: Return raw scraper data if adapter doesn't provide more
                res.json((client as any).cachedWorldData?.data || {});
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            // Create a NEW session for this user
            const session = await sessionManager.createSession(username, password);
            res.json({ success: true, token: session.sessionId, userId: session.userId });
        } catch (error: any) {
            res.status(401).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/logout', async (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            await sessionManager.destroySession(token);
        }
        res.json({ success: true });
    });

    // --- Protected Routes (Require Valid Session) ---
    appRouter.use(authenticateSession);

    appRouter.get('/actors', async (req, res) => {
        try {
            const client = (req as any).foundryClient;

            const systemInfo = await client.getSystem();
            const adapter = getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

            const rawActors = await client.getActors();

            // Filter is handled by Foundry permission naturally for the user?
            // Yes, standard User can only see what they own/observe.
            // Client.getActors() returns what the socket gives.

            const { CompendiumCache } = await import('../core/foundry/compendium-cache');
            const cache = CompendiumCache.getInstance();
            if (!cache.hasLoaded()) await cache.initialize(client);

            const normalize = async (actorList: any[]) => Promise.all(actorList.map(async (actor: any) => {
                if (!actor.computed) actor.computed = {};
                if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
                if (adapter.resolveActorNames) adapter.resolveActorNames(actor, cache);
                return adapter.normalizeActorData(actor);
            }));

            // We treat all returned actors as "visible"
            // Filter by ownership and type
            const currentUserId = client.userId;

            // DEBUG: Log actor types to identify NPC patterns
            const actorTypes = new Set(rawActors.map((a: any) => a.type));
            const actorFolders = new Set(rawActors.map((a: any) => a.folder).filter(Boolean));
            logger.info(`Core Service | Actor types found: ${Array.from(actorTypes).join(', ')}`);
            logger.info(`Core Service | Actor folders found: ${Array.from(actorFolders).join(', ')}`);
            logger.info(`Core Service | Sample actor: ${JSON.stringify(rawActors[0] || {}).substring(0, 300)}`);

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

                // CRITICAL: Exclude NPCs - Shadowdark uses 'NPC' (uppercase) and 'Player' types
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

    appRouter.get('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor || actor.error) {
                return res.status(actor?.error ? 503 : 404).json({ error: actor?.error || 'Actor not found' });
            }

            const { CompendiumCache } = await import('../core/foundry/compendium-cache');
            const cache = CompendiumCache.getInstance();
            if (!cache.hasLoaded()) await cache.initialize(client);

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
            const { getMatchingAdapter } = await import('../modules/core/registry');
            const adapter = getMatchingAdapter(resolvedActor);
            const normalizedActor = adapter.normalizeActorData(resolvedActor);

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
            const adapter = getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

            if (type === 'use-item') {
                const result = await client.useItem(req.params.id, key);
                return res.json({ success: true, result });
            }

            let rollData;
            if (type === 'formula') {
                rollData = { formula: key, label: 'Custom Roll' };
            } else {
                rollData = adapter.getRollData(actor, type, key, options);
            }

            if (!rollData) throw new Error('Cannot determine roll formula');

            const result = await client.roll(rollData.formula, rollData.label);
            res.json({ success: true, result, label: rollData.label });
        } catch (error: any) {
            logger.error(`Core Service | Roll failed: ${error.message}`);
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

    appRouter.get('/actors/:id/predefined-effects', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor) return res.status(404).json({ error: 'Actor not found' });
            const adapter = getAdapter(actor.systemId);
            if (!adapter) throw new Error(`Adapter ${actor.systemId} not found`);
            // @ts-ignore
            const effects = await adapter.getPredefinedEffects(client);
            res.json({ effects });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/predefined-effects', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { effectKey } = req.body;
            const success = await client.toggleStatusEffect(req.params.id, effectKey);
            res.json({ success });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/actors/:id/effects', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { effectId, updateData } = req.body;
            await client.updateActorEffect(req.params.id, effectId, updateData);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id/effects', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const effectId = req.query.effectId as string;
            if (!effectId) return res.status(400).json({ success: false, error: 'Missing effectId' });
            await client.deleteActorEffect(req.params.id, effectId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.get('/chat', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const limit = parseInt(req.query.limit as string) || config.app.chatHistory || 25;
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

            if (message.trim().match(/^\/(r|roll)\s/)) {
                const result = await client.roll(message);
                res.json({ success: true, type: 'roll', result });
            } else {
                await client.sendMessage(message);
                res.json({ success: true, type: 'chat' });
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/foundry/document', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const uuid = req.query.uuid as string;
            if (!uuid) return res.status(400).json({ error: 'Missing uuid' });

            // Replicate the evaluation logic for fetching by UUID
            const data = await client.evaluate(async (uuid: any) => {
                // @ts-ignore
                const doc = await fromUuid(uuid);
                return doc?.toObject() || null;
            }, uuid);

            if (!data) return res.status(404).json({ error: 'Document not found' });
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/users', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const users = await client.getUsersDetails();
            res.json({ users });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Modules Catch-all (Regex used to avoid Express 5/path-to-regexp v8 string parsing issues)
    appRouter.all(/\/modules\/([^\/]+)\/(.*)/, async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const systemId = (req.params as any)[0];
            const routePath = (req.params as any)[1];
            const { serverModules } = await import('../modules/core/server-modules');
            const sysModule = serverModules[systemId];

            if (!sysModule || !sysModule.apiRoutes) {
                return res.status(404).json({ error: `Module ${systemId} not found` });
            }

            // Find matching handler (similar to Next.js catch-all logic)
            const routes = Object.keys(sysModule.apiRoutes);
            const matchedPattern = routes.find(pattern => {
                const patternSegments = pattern.split('/');
                const actualSegments = routePath.split('/');
                if (patternSegments.length !== actualSegments.length) return false;
                return patternSegments.every((p, i) => p.startsWith('[') || p === actualSegments[i]);
            });

            if (!matchedPattern) return res.status(404).json({ error: `Route ${routePath} not found` });

            const handler = sysModule.apiRoutes[matchedPattern];
            // Mock Next.js Request/Params for compatibility
            const nextRequest = {
                json: async () => req.body,
                method: req.method,
                url: req.url,
                headers: req.headers
            } as any;
            const nextParams = { params: Promise.resolve({ systemId, route: routePath.split('/') }) };

            const result = await handler(nextRequest, nextParams);

            // Handle NextResponse
            if (result.json) {
                const data = await result.json();
                return res.status(result.status || 200).json(data);
            }
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
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
        const client = sessionManager.getSystemClient();
        res.json({
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
            const client = sessionManager.getSystemClient();
            // Try live system info first
            let worlds: any[] = [];
            try {
                const systemInfo = await client.getSystem();
                if (systemInfo?.worlds) {
                    worlds = systemInfo.worlds;
                }
            } catch (e) {
                // Ignore live fetch error, fallback to cache
            }

            if (worlds.length === 0) {
                const { SetupScraper } = await import('../core/foundry/SetupScraper');

                // Try scraping /setup page first (Live Discovery)
                worlds = await SetupScraper.scrapeAvailableWorlds(client.url);

                // If scraping failed, fallback to cache
                if (worlds.length === 0) {
                    const cache = await SetupScraper.loadCache();
                    if (cache.worlds) {
                        worlds = Object.values(cache.worlds);
                    }
                }
            }

            res.json(worlds);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.get('/cache', async (req, res) => {
        try {
            const { SetupScraper } = await import('../core/foundry/SetupScraper');
            const cache = await SetupScraper.loadCache();
            res.json(cache);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/setup/scrape', async (req, res) => {
        const { sessionCookie } = req.body;
        if (!sessionCookie) return res.status(400).json({ error: 'Session cookie required' });

        try {
            const { SetupScraper } = await import('../core/foundry/SetupScraper');
            const client = sessionManager.getSystemClient();
            logger.info(`Core Service | Triggering manual deep-scrape via CLI...`);

            // Scrape
            const result = await SetupScraper.scrapeWorldData(client.url, sessionCookie);

            // Save to Cache
            await SetupScraper.saveCache(result);

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
            const client = sessionManager.getSystemClient();
            await client.launchWorld(worldId);
            res.json({ success: true, message: `Request to launch world ${worldId} sent.` });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/shutdown', async (req, res) => {
        try {
            const client = sessionManager.getSystemClient();
            await client.shutdownWorld();
            res.json({ success: true, message: 'Request to shut down current world sent.' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Mount Routers
    app.use('/api', appRouter);
    app.use('/admin', adminRouter);

    app.listen(corePort, '127.0.0.1', () => {
        console.log(`Core Service | Silent Daemon running on http://127.0.0.1:${corePort}`);
        console.log(`Core Service | App API: http://127.0.0.1:${corePort}/api`);
        console.log(`Core Service | Admin API: http://127.0.0.1:${corePort}/admin (Localhost Only)`);
    });
}

startServer().catch(err => {
    console.error('Core Service | Unhandled startup error:', err);
    process.exit(1);
});
