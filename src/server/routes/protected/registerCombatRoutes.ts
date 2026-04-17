import express from 'express';
import { createCombatService } from '@server/services/combats/CombatService';

interface CombatRouteDeps {
    normalizeActors: (actorList: any[], client: any) => Promise<any[]>;
}

export function registerCombatRoutes(appRouter: express.Router, deps: CombatRouteDeps) {
    // Combat domain service: displaced logic for listing, turn control, and initiative rolls.
    const combatService = createCombatService(deps);

    appRouter.get('/combats', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await combatService.listCombats(client);
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/next-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await combatService.advanceTurn(client, req.params.id);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/previous-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await combatService.previousTurn(client, req.params.id);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/combatants/:combatantId/roll-initiative', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const payload = await combatService.rollInitiative(client, req.params.id, req.params.combatantId, req.body);
            if ((payload as any)?.error && (payload as any)?.status) {
                return res.status((payload as any).status).json({ error: (payload as any).error });
            }
            res.json(payload);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /* TODO Add next or finish round if actorId matches current combatant.actorId */
}
