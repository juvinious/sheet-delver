import express from 'express';
import { createModuleProxyService } from '@server/services/modules/ModuleProxyService';
import { logger } from '@shared/utils/logger';

export function createModuleRouter(tryAuthenticateSession: express.RequestHandler) {
    // --- Module Router (Permissive Auth) ---
    // Mounted before the global auth middleware to allow module-specific permissive routes
    const moduleRouter = express.Router();
    moduleRouter.use(tryAuthenticateSession);

    // Module proxy service: displaced matching and dispatch orchestration for module api routes.
    const moduleProxyService = createModuleProxyService();

    // Express 5: String wildcards (*) must be named or used via RegExp.
    // Named capturing groups (?<name>) populate req.params.name
    moduleRouter.all(/^(.*)$/, async (req, res) => {
        try {
            const result = await moduleProxyService.dispatchModuleRoute({
                path: req.path,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body,
                foundryClient: req.foundryClient,
                userSession: req.userSession
            });

            return res.status(result.status).json(result.payload);
        } catch (error: any) {
            logger.error(`Module Routing Error (${req.path}): ${error.message}`);
            return res.status(500).json({ error: error.message });
        }
    });

    return moduleRouter;
}
