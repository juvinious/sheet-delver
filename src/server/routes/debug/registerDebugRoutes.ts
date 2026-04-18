import express from 'express';
import { createDebugService } from '@server/services/debug/DebugService';

type GetOrRestoreSession = (token: string) => Promise<any>;

interface DebugRouteDeps {
    getOrRestoreSession: GetOrRestoreSession;
}

export function registerDebugRoutes(app: express.Express, deps: DebugRouteDeps) {
    // Debug domain service: session-bound actor lookup with no system fallback.
    const debugService = createDebugService(deps);

    // Debug route requires an authenticated session token.
    app.get('/api/debug/actor/:id', async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing Session Token' });
        }

        try {
            const actor = await debugService.getActor(req.params.id, authHeader);
            res.json(actor);
        } catch (error: any) {
            const status = typeof error?.status === 'number' ? error.status : 500;
            res.status(status).json({ error: error.message });
        }
    });
}
