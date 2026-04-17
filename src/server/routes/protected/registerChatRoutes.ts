import express from 'express';
import type { AppConfig } from '@shared/interfaces';

interface ChatRouteDeps {
    config: AppConfig;
}

export function registerChatRoutes(appRouter: express.Router, deps: ChatRouteDeps) {
    appRouter.get('/chat', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const limit = parseInt(req.query.limit as string) || deps.config.app.chatHistory || 100;
            const messages = await client.getChatLog(limit);
            res.json({ messages });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/chat/send', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const { message } = req.body;
            if (!message) return res.status(400).json({ error: 'Message is empty' });

            const ROLL_CMD = /^\/(r|roll|gmr|gmroll|br|blindroll|sr|selfroll)(?=\s|$|\d)/i;
            const match = message.trim().match(ROLL_CMD);

            if (match) {
                const cmd = match[1].toLowerCase();
                // Determine roll mode from command if explicit, otherwise use body value
                let rollMode = req.body.rollMode;
                if (cmd === 'gmr' || cmd === 'gmroll') rollMode = 'gmroll';
                if (cmd === 'br' || cmd === 'blindroll') rollMode = 'blindroll';
                if (cmd === 'sr' || cmd === 'selfroll') rollMode = 'selfroll';
                if (cmd === 'r' || cmd === 'roll') rollMode = 'publicroll';

                // Strip the command prefix so Roll class gets a clean formula
                const cleanFormula = message.trim().replace(ROLL_CMD, '').trim();
                const result = await client.roll(cleanFormula, undefined, {
                    rollMode: rollMode,
                    speaker: req.body.speaker
                });
                res.json({ success: true, type: 'roll', result });
            } else {
                await client.sendMessage(message, {
                    rollMode: req.body.rollMode,
                    speaker: req.body.speaker
                });
                res.json({ success: true, type: 'chat' });
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
