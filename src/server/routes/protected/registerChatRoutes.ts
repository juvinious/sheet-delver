import express from 'express';
import type { AppConfig } from '@shared/interfaces';
import { createChatService } from '@server/services/chat/ChatService';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { isErrorPayload } from '@server/shared/utils/isErrorPayload';

interface ChatRouteDeps {
    config: AppConfig;
}

export function registerChatRoutes(appRouter: express.Router, deps: ChatRouteDeps) {
    // Chat domain service: displaced logic for feed reads and send/roll command handling.
    const chatService = createChatService(deps);

    appRouter.get('/chat', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await chatService.getChatLog(client, req.query.limit);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.post('/chat/send', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await chatService.sendChatMessage(client, req.body);
            if (isErrorPayload(payload)) {
                return res.status(payload.status).json({ error: payload.error });
            }
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
