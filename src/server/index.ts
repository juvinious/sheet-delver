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

    const { host, port } = config.app || { host: 'localhost', port: 3000 };
    const corePort = process.env.PORT ? parseInt(process.env.PORT) : (port + 1);

    const app = express();
    app.use(express.json());
    app.use(cors());

    // Initialize Foundry Client
    const client = createFoundryClient({
        ...config.foundry
    });

    // --- App API (Public/Proxy-bound) ---
    // This API serves the frontend via the Next.js proxy
    const appRouter = express.Router();

    appRouter.get('/status', async (req, res) => {
        try {
            const system: any = await client.getSystem().catch(() => null);
            if (system && system.id) {
                system.config = getConfig(system.id);
            }

            const users = system?.users?.list || [];
            const sanitizedUsers = users.map((u: any) => ({
                // Intentionally omit ID for security. Source of Truth is Core Cache.
                name: u.name,
                role: u.role,
                color: u.color,
                active: u.active
            }));

            res.json({
                connected: client.isConnected,
                isLoggedIn: client.isLoggedIn,
                users: sanitizedUsers,
                system,
                url: client.url,
                appVersion: config.app.version
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            await client.login(username, password);
            res.json({ success: true, userId: client.userId });
        } catch (error: any) {
            res.status(401).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/logout', async (req, res) => {
        try {
            await client.logout();
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors', async (req, res) => {
        try {
            const systemInfo = await client.getSystem();
            const adapter = getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

            const currentUserId = client.userId;
            const users = systemInfo.users?.list || [];
            const currentUser = users.find((u: any) => (u._id || u.id) === currentUserId);
            const isGM = currentUser?.role >= 4;

            const rawActors = await client.getActors();
            const owned: any[] = [];
            const readOnly: any[] = [];

            const { CompendiumCache } = await import('../core/foundry/compendium-cache');
            const cache = CompendiumCache.getInstance();
            if (!cache.hasLoaded()) await cache.initialize(client);

            for (const actor of rawActors) {
                const ownership = actor.ownership || {};
                const isOwner = isGM || (currentUserId && ownership[currentUserId] >= 3);
                const isObserver = (currentUserId && ownership[currentUserId] >= 2) || ownership.default >= 2;

                if (isOwner) owned.push(actor);
                else if (isObserver) readOnly.push(actor);
            }

            const normalize = async (actorList: any[]) => Promise.all(actorList.map(async (actor: any) => {
                if (!actor.computed) actor.computed = {};
                if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
                if (adapter.resolveActorNames) adapter.resolveActorNames(actor, cache);
                return adapter.normalizeActorData(actor);
            }));

            res.json({
                actors: await normalize(owned),
                ownedActors: await normalize(owned),
                readOnlyActors: await normalize(readOnly),
                system: systemInfo.id
            });
        } catch (error: any) {
            logger.error(`Core Service | Actors fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/:id', async (req, res) => {
        try {
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
            const result = await client.updateActor(req.params.id, req.body);
            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/roll', async (req, res) => {
        try {
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
            const newItemId = await client.createActorItem(req.params.id, req.body);
            res.json({ success: true, id: newItemId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.put('/actors/:id/items', async (req, res) => {
        try {
            await client.updateActorItem(req.params.id, req.body);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id/items', async (req, res) => {
        try {
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
            const { effectKey } = req.body;
            const success = await client.toggleStatusEffect(req.params.id, effectKey);
            res.json({ success });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/actors/:id/effects', async (req, res) => {
        try {
            const { effectId, updateData } = req.body;
            await client.updateActorEffect(req.params.id, effectId, updateData);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id/effects', async (req, res) => {
        try {
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
            const limit = parseInt(req.query.limit as string) || config.app.chatHistory || 25;
            const messages = await client.getChatLog(limit);
            res.json({ messages });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/chat/send', async (req, res) => {
        try {
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
            const users = await client.getUsersDetails();
            res.json({ users });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Modules Catch-all (Regex used to avoid Express 5/path-to-regexp v8 string parsing issues)
    appRouter.all(/\/modules\/([^\/]+)\/(.*)/, async (req, res) => {
        try {
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
            await client.launchWorld(worldId);
            res.json({ success: true, message: `Request to launch world ${worldId} sent.` });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/shutdown', async (req, res) => {
        try {
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

        // Connect to Foundry in background after listener is up
        console.log(`Core Service | Initializing Foundry connection to ${config.foundry.url}...`);

        async function connectWithRetry() {
            try {
                await client.connect();
                logger.info('Core Service | Foundry connected successfully.');
            } catch (e: any) {
                logger.error(`Core Service | Initial connection failed: ${e.message}. Retrying in 5s...`);
                setTimeout(connectWithRetry, 5000);
            }
        }
        connectWithRetry();
    });
}

startServer().catch(err => {
    console.error('Core Service | Unhandled startup error:', err);
    process.exit(1);
});
