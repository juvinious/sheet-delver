import express from 'express';
import type { AppConfig } from '@shared/interfaces';
import { createChatService } from '@server/services/chat/ChatService';

interface ChatRouteDeps {
    config: AppConfig;
}

export function registerChatRoutes(appRouter: express.Router, deps: ChatRouteDeps) {
    // Chat domain service: displaced logic for feed reads and send/roll command handling.
    const chatService = createChatService(deps);

    appRouter.get('/chat', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await chatService.getChatLog(client, req.query.limit);
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/chat/send', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await chatService.sendChatMessage(client, req.body);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
