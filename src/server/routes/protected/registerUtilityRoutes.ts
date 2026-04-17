import express from 'express';
import { UserRole } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';

export function registerUtilityRoutes(appRouter: express.Router) {
    appRouter.get('/foundry/document', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const uuid = req.query.uuid as string;
            if (!uuid) return res.status(400).json({ error: 'Missing uuid' });

            // Use the new headless-compatible fetch method
            const data = await client.fetchByUuid(uuid);

            if (!data) return res.status(404).json({ error: 'Document not found' });
            res.json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/session/users', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            // Use System Client to fetch users (CoreSocket has the data methods)
            const users = await systemService.getSystemClient().getUsers();
            logger.debug(`[API] /session/users: Found ${users.length} users via System Client`);

            // Sanitize and Map (Consistent with statusHandler)
            const sanitizedUsers = users.map((u: any) => {
                return {
                    _id: u._id || u.id,
                    name: u.name,
                    role: u.role,
                    isGM: u.role >= UserRole.ASSISTANT,
                    active: u.active,
                    color: u.color,
                    characterId: u.character,
                    img: client.resolveUrl(u.avatar || u.img)
                };
            });

            res.json({ users: sanitizedUsers });
        } catch (error: any) {
            logger.error(`User Fetch Error: ${error.message}`);
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });

    // --- Shared Content API ---
    appRouter.get('/shared-content', (req, res) => {
        try {
            // CRITICAL: Use the *User's* client to strip out shared content relevant to THEM.
            // If the GM shares with "User A", only User A's socket receives the event.
            // The System Client (Service Account) would miss it unless it was the target or it was a broadcast.
            const client = (req as any).foundryClient || systemService.getSystemClient();

            // Note: SocketClient logic stores the last received 'shareImage'/'showEntry' event.
            // This works perfectly for the specific user's view.
            const content = (client as any).getSharedContent();

            // Resolve URLs in shared content
            if (content && content.type === 'image' && content.data?.url) {
                content.data.url = client.resolveUrl(content.data.url);
            }

            res.json(content || { type: null });
        } catch (error: any) {
            logger.error('Error fetching shared content:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
