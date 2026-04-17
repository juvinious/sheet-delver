import express from 'express';

type GetOrRestoreSession = (token: string) => Promise<any>;

interface DebugRouteDeps {
    getSystemClient: () => any;
    getOrRestoreSession: GetOrRestoreSession;
}

export function registerDebugRoutes(app: express.Express, deps: DebugRouteDeps) {
    // Debug route - allow using system client if no session provided for easier dev access
    app.get('/api/debug/actor/:id', async (req, res) => {
        try {
            let client = deps.getSystemClient();

            // Try to use user session if available for better data accuracy
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const session = await deps.getOrRestoreSession(token);
                if (session) client = session.client as any;
            }

            const actor = await client.getActor(req.params.id);
            res.json(actor);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
