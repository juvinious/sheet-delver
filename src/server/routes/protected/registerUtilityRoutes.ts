import express from 'express';
import { logger } from '@shared/utils/logger';
import { createUtilityService } from '@server/services/utility/UtilityService';
import type { FoundryUserLike } from '@server/shared/types/foundry';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';

interface UtilityRouteDeps {
    getSystemUsers: () => Promise<FoundryUserLike[]>;
    getFallbackSharedContentClient: () => RouteFoundryClient;
}

export function registerUtilityRoutes(appRouter: express.Router, deps: UtilityRouteDeps) {
    // Utility domain service: displaced dashboard helper logic for documents, users, and shared content.
    const utilityService = createUtilityService(deps);

    appRouter.get('/foundry/document', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await utilityService.getFoundryDocument(client, req.query.uuid as string);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/session/users', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await utilityService.getSessionUsers(client);
            res.json(payload);
        } catch (error: any) {
            logger.error(`User Fetch Error: ${error.message}`);
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });

    // --- Shared Content API ---
    appRouter.get('/shared-content', (req, res) => {
        try {
            const client = req.foundryClient;
            utilityService.getSharedContent(client).then(payload => res.json(payload)).catch((error: any) => {
                logger.error('Error fetching shared content:', error);
                res.status(500).json({ error: 'Internal server error' });
            });
        } catch (error: any) {
            logger.error('Error fetching shared content:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
