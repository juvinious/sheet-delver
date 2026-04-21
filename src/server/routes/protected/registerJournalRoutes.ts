import express from 'express';
import { createJournalService } from '@server/services/journals/JournalService';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { isErrorPayload } from '@server/shared/utils/isErrorPayload';

export function registerJournalRoutes(appRouter: express.Router) {
    // Journal domain service: displaced logic for visibility-filtered listing and CRUD operations.
    const journalService = createJournalService();

    appRouter.get('/journals', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await journalService.listJournals(client);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.post('/journals', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await journalService.createJournal(client, req.body);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.get('/journals/:id', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await journalService.getJournalById(client, req.params.id);
            if (isErrorPayload(payload)) {
                return res.status(payload.status).json({ error: payload.error });
            }
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.patch('/journals/:id', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await journalService.updateJournal(client, req.params.id, req.body);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.delete('/journals/:id', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await journalService.deleteJournal(client, req.params.id, req.query);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
