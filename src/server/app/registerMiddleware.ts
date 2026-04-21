import type express from 'express';
import { logger } from '@shared/utils/logger';

export function registerMiddleware(app: express.Express): void {
    // Keep this at the composition layer so request logging can be toggled/replaced centrally.
    // It remains debug-level only to avoid noisy production logs.
    app.use((req, _res, next) => {
        logger.debug(`[CoreService] INCOMING REQUEST: ${req.method} ${req.url}`);
        next();
    });
}
