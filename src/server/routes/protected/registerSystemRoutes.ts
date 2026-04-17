import express from 'express';
import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';

export function registerSystemRoutes(appRouter: express.Router) {
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
}
