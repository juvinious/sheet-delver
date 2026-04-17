import type { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/utils/logger';

/**
 * Middleware that restricts access to localhost only.
 * Used by the admin router to block non-local callers.
 */
export function requireLocalhost(req: Request, res: Response, next: NextFunction): void {
    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') {
        logger.warn(`Core Service | Blocked non-local Admin API request from ${remoteAddress}`);
        res.status(403).json({ error: 'Admin access restricted to localhost' });
        return;
    }
    next();
}
