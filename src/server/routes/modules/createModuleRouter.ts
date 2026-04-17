import express from 'express';
import { getServerModule } from '@modules/registry/server';
import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';

export function createModuleRouter(tryAuthenticateSession: express.RequestHandler) {
    // --- Module Router (Permissive Auth) ---
    // Mounted before the global auth middleware to allow module-specific permissive routes
    const moduleRouter = express.Router();
    moduleRouter.use(tryAuthenticateSession);

    // Express 5: String wildcards (*) must be named or used via RegExp.
    // Named capturing groups (?<name>) populate req.params.name
    moduleRouter.all(/^(.*)$/, async (req, res) => {
        try {
            const parts = req.path.split('/').filter(Boolean);
            const systemId = parts[0];
            const routePath = parts.slice(1).join('/');

            if (!systemId) return res.status(404).json({ error: 'No system specified' });

            // Hard Wall: Dynamically import the server module directly from its folder.
            // Since this is in server/index.ts (run via ts-node), it is never bundled for the browser.
            // Correctly resolve the server module via the registry manifest
            const sysModule = await getServerModule(systemId);
            if (!sysModule) {
                logger.warn(`Module Routing | Module ${systemId} not found or missing server entry point.`);
                return res.status(404).json({ error: `Module ${systemId} not found` });
            }

            if (!sysModule || !sysModule.apiRoutes) {
                logger.warn(`Module Routing | Module ${systemId} missing apiRoutes.`);
                return res.status(404).json({ error: `Module ${systemId} API not available` });
            }

            let matchedPattern: string | undefined;
            const routes = Object.keys(sysModule.apiRoutes);

            for (const pattern of routes) {
                const regex = new RegExp('^' + pattern.replace(/\[.*?\]/g, '([^/]+)') + '$');
                const isMatch = regex.test(routePath);
                if (isMatch) {
                    matchedPattern = pattern;
                    break;
                }
            }

            if (!matchedPattern) {
                logger.warn(`Module Routing | No handler found for ${systemId}/${routePath}. Available routes: ${routes.join(', ')}`);
                logger.error(`[DEBUG] sysModule.apiRoutes keys for ${systemId}:`, Object.keys(sysModule.apiRoutes));
                return res.status(404).json({ error: `Route ${routePath} not found` });
            }

            const handler = sysModule.apiRoutes[matchedPattern];
            const nextRequest = {
                json: async () => req.body,
                method: req.method,
                url: req.url,
                headers: req.headers,
                foundryClient: (req as any).foundryClient || systemService.getSystemClient(),
                userSession: (req as any).userSession
            } as any;
            const nextParams = { params: Promise.resolve({ systemId, route: routePath.split('/') }) };

            logger.info(`Module Router | Calling handler for ${matchedPattern} with actorId: ${routePath.split('/')[1]}`);
            const result = await handler(nextRequest, nextParams);

            if (result && result.json) {
                const data = await result.json();
                return res.status(result.status || 200).json(data);
            }
            return res.json(result);
        } catch (error: any) {
            logger.error(`Module Routing Error (${req.path}): ${error.message}`);
            return res.status(500).json({ error: error.message });
        }
    });

    return moduleRouter;
}
