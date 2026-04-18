import express from 'express';
import type { AppConfig } from '@shared/interfaces';
import { systemService } from '@core/system/SystemService';
import { logger } from '@shared/utils/logger';
import type { SessionManager } from '@core/session/SessionManager';

export function createAuthenticateSession(sessionManager: SessionManager, config: AppConfig): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        // Exempt Socket.io handshake from REST middleware
        if (req.url.includes('socket.io')) return next();

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: Missing Session Token' });
        }

        const token = authHeader.split(' ')[1];

        // 1. Check for System Service Account using dedicated app service token
        if (config.security.serviceToken && token === config.security.serviceToken) {
            (req as any).foundryClient = systemService.getSystemClient();
            (req as any).isSystem = true;
            return next();
        }

        // 2. Fallback to Standard User Session
        sessionManager.getOrRestoreSession(token).then((session) => {
            if (!session || !session.client.userId) {
                return res.status(401).json({ error: 'Unauthorized: Invalid or Expired Session' });
            }

            (req as any).foundryClient = session.client;
            (req as any).userSession = session;
            (req as any).isSystem = false;
            next();
        }).catch((err: Error) => {
            logger.error(`Authentication Error: ${err.message}`);
            res.status(500).json({ error: 'Internal Authentication Error' });
        });
    };
}
