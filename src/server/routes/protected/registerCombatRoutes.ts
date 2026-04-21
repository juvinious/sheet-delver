import express from 'express';
import { createCombatService } from '@server/services/combats/CombatService';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { isErrorPayload } from '@server/shared/utils/isErrorPayload';

interface CombatRouteDeps {
    normalizeActors: (actorList: any[], client: any) => Promise<any[]>;
}

export function registerCombatRoutes(appRouter: express.Router, deps: CombatRouteDeps) {
    // Combat domain service: displaced logic for listing, turn control, and initiative rolls.
    const combatService = createCombatService(deps);

    appRouter.get('/combats', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await combatService.listCombats(client);
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.post('/combats/:id/next-turn', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await combatService.advanceTurn(client, req.params.id);
            if (isErrorPayload(payload)) {
                return res.status(payload.status).json({ error: payload.error });
            }
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.post('/combats/:id/previous-turn', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await combatService.previousTurn(client, req.params.id);
            if (isErrorPayload(payload)) {
                return res.status(payload.status).json({ error: payload.error });
            }
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    appRouter.post('/combats/:id/combatants/:combatantId/roll-initiative', async (req, res) => {
        try {
            const client = req.foundryClient;
            const payload = await combatService.rollInitiative(client, req.params.id, req.params.combatantId, req.body);
            if (isErrorPayload(payload)) {
                return res.status(payload.status).json({ error: payload.error });
            }
            res.json(payload);
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    /* TODO Add next or finish round if actorId matches current combatant.actorId */
}
