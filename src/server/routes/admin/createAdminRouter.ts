import express from 'express';
import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';
import { SetupManager } from '@core/foundry/SetupManager';

interface AdminRouterDeps {
    getSystemStatusPayload: () => Promise<any>;
}

export function createAdminRouter(deps: AdminRouterDeps) {
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
        const systemStatus = await deps.getSystemStatusPayload();
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
            let worlds: any[] = [];

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
            const client = systemService.getSystemClient();
            logger.info('Core Service | Triggering manual deep-scrape via CLI...');

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

    return adminRouter;
}
