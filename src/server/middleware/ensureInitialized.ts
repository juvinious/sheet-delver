import express from 'express';
import type { SessionManager } from '@core/session/SessionManager';

export function createEnsureInitialized(sessionManager: SessionManager): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (!sessionManager.isCacheReady()) {
            return res.status(503).json({
                status: 'initializing',
                message: 'Compendium cache is warming up, please wait.'
            });
        }
        next();
    };
}
