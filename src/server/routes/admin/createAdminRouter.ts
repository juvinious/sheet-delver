import express from 'express';
import { logger } from '@shared/utils/logger';
import { createAdminService } from '@server/services/admin/AdminService';

interface AdminRouterDeps {
    getSystemStatusPayload: () => Promise<any>;
}

export function createAdminRouter(deps: AdminRouterDeps) {
    // --- Admin API (Local-Only) ---
    // This API is used by the standalone CLI tool
    const adminRouter = express.Router();

    // Admin domain service: displaced operational logic for status, worlds, cache, and world actions.
    const adminService = createAdminService(deps);

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
        const payload = await adminService.getStatus();
        res.json(payload);
    });

    adminRouter.get('/worlds', async (req, res) => {
        try {
            const payload = await adminService.listWorlds();
            res.json(payload);
        } catch (error) {
            logger.error('Failed to list worlds', error);
            res.status(500).json({ error: 'Failed to list worlds' });
        }
    });

    // Setup endpoints removed - functionality migrated to CLI admin tool

    adminRouter.get('/cache', async (req, res) => {
        try {
            const payload = await adminService.getCache();
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/setup/scrape', async (req, res) => {
        try {
            const payload = await adminService.scrapeSetup(req.body?.sessionCookie);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/launch', async (req, res) => {
        try {
            const payload = await adminService.launchWorld(req.body?.worldId);
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    adminRouter.post('/world/shutdown', async (req, res) => {
        try {
            const payload = await adminService.shutdownWorld();
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    return adminRouter;
}
