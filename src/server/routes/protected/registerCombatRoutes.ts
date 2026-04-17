import express from 'express';
import { logger } from '@shared/utils/logger';
import { getAdapter } from '@modules/registry/server';

interface CombatRouteDeps {
    normalizeActors: (actorList: any[], client: any) => Promise<any[]>;
}

export function registerCombatRoutes(appRouter: express.Router, deps: CombatRouteDeps) {
    appRouter.get('/combats', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combats = await client.getCombats();

            // Consolidate actor fetching to avoid N+1 requests from frontend
            const enrichedCombats = await Promise.all(combats.map(async (combat: any) => {
                const actorIds = [...new Set((combat.combatants || []).map((c: any) => c.actorId).filter(Boolean))];
                const actorsMap: Record<string, any> = {};

                // Fetch all unique actors in this combat
                await Promise.all(actorIds.map(async (id: any) => {
                    try {
                        const actor = await client.getActor(id);
                        if (actor) actorsMap[id] = actor;
                    } catch (e) {
                        logger.error(`Failed to fetch actor ${id} for combat ${combat._id}`);
                    }
                }));

                // Attach actor data to combatants (Normalized for HUD requirements)
                const actorsToNormalize = Object.values(actorsMap).filter(Boolean);
                const normalizedActors = await deps.normalizeActors(actorsToNormalize, client);
                const normalizedMap: Record<string, any> = {};
                normalizedActors.forEach((a: any) => {
                    const id = a._id || a.id;
                    normalizedMap[id] = a;
                });

                const enrichedCombatants = (combat.combatants || []).map((c: any) => ({
                    ...c,
                    actor: normalizedMap[c.actorId] || null
                }));

                return { ...combat, combatants: enrichedCombatants };
            }));

            res.json({ success: true, combats: enrichedCombats });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    const isAuthorizedForCombatTurn = async (client: any, combat: any, userId: string): Promise<boolean> => {
        const users = await client.getUsers();
        const user = users.find((u: any) => (u._id || u.id) === userId);
        const isGM = (user?.role || user?.permissions?.role || 0) >= 3;
        if (isGM) return true;

        // Check if the current turn's combatant belongs to an actor owned by the user
        const currentTurn = combat.turn ?? 0;
        const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
            const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
            const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
            return (ib - ia) || (a._id > b._id ? 1 : -1);
        });

        const activeCombatant = sortedCombatants[currentTurn];
        if (!activeCombatant || !activeCombatant.actorId) return false;

        const actor = await client.getActor(activeCombatant.actorId);
        if (!actor) return false;

        // Foundry ownership check: 3 is OWNER
        const ownership = actor.ownership?.[userId] || actor.permission?.[userId] || 0;
        return ownership >= 3;
    };

    appRouter.post('/combats/:id/next-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;

            // Fetch the specific combat to get current turn/round
            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);

            if (!combat) {
                return res.status(404).json({ error: 'Combat not found' });
            }

            if (!(await isAuthorizedForCombatTurn(client, combat, client.userId))) {
                return res.status(403).json({ error: 'Unauthorized: You do not own the current combatant and are not a GM' });
            }

            // Mimic Foundry's turn logic: sort by initiative desc, tie-break by ID
            const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
                const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
                const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
                return (ib - ia) || (a._id > b._id ? 1 : -1);
            });

            let currentRound = combat.round || 0;
            let currentTurn = combat.turn ?? -1;

            if (currentRound === 0) {
                currentRound = 1;
                currentTurn = 0;
            } else {
                currentTurn += 1;
                if (currentTurn >= sortedCombatants.length) {
                    currentRound += 1;
                    currentTurn = 0;
                }
            }

            await client.dispatchDocumentSocket('Combat', 'update', {
                updates: [{ _id: combatId, round: currentRound, turn: currentTurn }]
            });

            res.json({ success: true, round: currentRound, turn: currentTurn });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/previous-turn', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;

            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);

            if (!combat) {
                return res.status(404).json({ error: 'Combat not found' });
            }

            const users = await client.getUsers();
            const user = users.find((u: any) => (u._id || u.id) === client.userId);
            const isGM = (user?.role || user?.permissions?.role || 0) >= 3;

            if (!isGM) {
                return res.status(403).json({ error: 'Unauthorized: Only GMs can move to previous turns' });
            }

            const sortedCombatants = [...(combat.combatants || [])].sort((a: any, b: any) => {
                const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
                const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
                return (ib - ia) || (a._id > b._id ? 1 : -1);
            });

            let currentRound = combat.round || 0;
            let currentTurn = combat.turn ?? 0;

            if (currentRound === 0) {
                // Do nothing if not started
            } else if (currentTurn === 0) {
                if (currentRound > 1) {
                    currentRound -= 1;
                    currentTurn = Math.max(0, sortedCombatants.length - 1);
                } else {
                    currentRound = 0;
                    currentTurn = 0;
                }
            } else {
                currentTurn -= 1;
            }

            await client.dispatchDocumentSocket('Combat', 'update', {
                updates: [{ _id: combatId, round: currentRound, turn: currentTurn }]
            });

            res.json({ success: true, round: currentRound, turn: currentTurn });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/combats/:id/combatants/:combatantId/roll-initiative', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const combatId = req.params.id;
            const combatantId = req.params.combatantId;
            const { formula, advantageMode } = req.body;

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

            const combats = await client.getCombats();
            const combat = combats.find((c: any) => (c._id || c.id) === combatId);
            if (!combat) return res.status(404).json({ error: 'Combat not found' });

            const combatant = combat.combatants?.find((c: any) => (c._id || c.id) === combatantId);
            if (!combatant) return res.status(404).json({ error: 'Combatant not found' });

            const actor = await client.getActor(combatant.actorId);
            if (!actor) return res.status(404).json({ error: 'Actor not found' });

            let finalFormula = formula;
            if (!finalFormula) {
                if (typeof (adapter as any).getInitiativeFormula === 'function') {
                    finalFormula = (adapter as any).getInitiativeFormula(actor);
                } else {
                    finalFormula = '1d20';
                }
            }

            // Apply ui-requested explicit advantage/disadvantage to standard D20 rolls
            if (advantageMode === 'advantage') {
                finalFormula = finalFormula.replace(/^(?:1d20|2d20k[hl]1)/i, '2d20kh1');
            } else if (advantageMode === 'disadvantage') {
                finalFormula = finalFormula.replace(/^(?:1d20|2d20k[hl]1)/i, '2d20kl1');
            } else if (advantageMode === 'normal') {
                finalFormula = finalFormula.replace(/^(?:2d20k[hl]1)/i, '1d20');
            }

            const speaker = {
                actor: actor._id || actor.id,
                alias: actor.name
            };

            const chatMessage = await client.roll(finalFormula, 'Initiative', { speaker });
            const total = parseInt(chatMessage.content);

            if (isNaN(total)) {
                throw new Error('Failed to parse roll total from chat message');
            }

            await client.dispatchDocumentSocket('Combatant', 'update', {
                updates: [{ _id: combatantId, initiative: total }]
            }, { type: 'Combat', id: combatId });

            res.json({ success: true, initiative: total });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /* TODO Add next or finish round if actorId matches current combatant.actorId */
}
