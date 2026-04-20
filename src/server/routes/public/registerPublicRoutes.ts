import express from 'express';
import { logger } from '@shared/utils/logger';
import { getRegisteredModules } from '@modules/registry/server';

interface PublicRouteDeps {
    statusHandler: express.RequestHandler;
    getSanitizedConfig: () => unknown;
    getSetupStatus: () => Promise<{ isConfigured: boolean }>;
    loginLimiter: express.RequestHandler;
    createSession: (username: string, password?: string) => Promise<{ sessionId: string; userId: string }>;
    destroySession: (token: string) => Promise<void>;
}

export function registerPublicRoutes(appRouter: express.Router, deps: PublicRouteDeps) {
    appRouter.get('/status', deps.statusHandler);
    appRouter.get('/session/connect', deps.statusHandler);

    appRouter.get('/config', (req, res) => {
        res.json(deps.getSanitizedConfig());
    });

    /**
     * Public endpoint to check if the application has been configured.
     * Used by the frontend 'Configuration Required' overlay.
     */
    appRouter.get('/config/setup-status', async (req, res) => {
        try {
            res.json(await deps.getSetupStatus());
        } catch (err: any) {
            logger.error(`Failed to check setup status: ${err.message}`);
            res.status(500).json({ isConfigured: false, error: 'Failed to verify configuration status' });
        }
    });

    appRouter.get('/registry/modules', (req, res) => {
        res.json(getRegisteredModules());
    });

    appRouter.post('/login', deps.loginLimiter, async (req, res) => {
        const { username, password } = req.body;
        try {
            const session = await deps.createSession(username, password);
            res.json({ success: true, token: session.sessionId, userId: session.userId });
        } catch (error: any) {
            res.status(401).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/logout', async (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            await deps.destroySession(token);
        }
        res.json({ success: true });
    });
}
