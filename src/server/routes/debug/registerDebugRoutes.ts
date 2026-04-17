import express from 'express';
import { createDebugService } from '@server/services/debug/DebugService';

type GetOrRestoreSession = (token: string) => Promise<any>;

interface DebugRouteDeps {
    getSystemClient: () => any;
    getOrRestoreSession: GetOrRestoreSession;
}

export function registerDebugRoutes(app: express.Express, deps: DebugRouteDeps) {
    // Debug domain service: displaced actor lookup logic with optional session-aware client selection.
    const debugService = createDebugService(deps);

    // Debug route - allow using system client if no session provided for easier dev access
    app.get('/api/debug/actor/:id', async (req, res) => {
        try {
            const actor = await debugService.getActor(req.params.id, req.headers.authorization);
            res.json(actor);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
