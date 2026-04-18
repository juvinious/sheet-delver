import express from 'express';
import type { AppConfig } from '@shared/interfaces';
import { systemService } from '@core/system/SystemService';
import type { SessionManager } from '@core/session/SessionManager';

export function createTryAuthenticateSession(sessionManager: SessionManager, config: AppConfig): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];

        // 1. Check for System Service Account using dedicated app service token
        if (config.security.serviceToken && token === config.security.serviceToken) {
            (req as any).foundryClient = systemService.getSystemClient();
            (req as any).isSystem = true;
            return next();
        }

        // 2. Fallback to User Session
        sessionManager.getOrRestoreSession(token).then((session) => {
            if (session && session.client.userId) {
                (req as any).foundryClient = session.client;
                (req as any).userSession = session;
                (req as any).isSystem = false;
            }
            next();
        }).catch(() => next());
    };
}
