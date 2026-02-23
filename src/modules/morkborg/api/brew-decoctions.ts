/**
 * POST /actors/[id]/brew-decoctions
 * Runs the Occult Herbmaster's Create Decoctions sequence:
 * - Draws 2 random decoctions from the roll table
 * - Rolls 1d4 for doses
 * - Creates the items on the actor
 * - Posts a blind-roll chat card
 */

import { MorkBorgAdapter } from '../adapter';
import { logger } from '../../../core/logger';

export async function handleBrewDecoctions(actorId: string, request: Request, client: any): Promise<Response> {
    try {
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const rollMode = body.rollMode || 'blindroll';

        const actor = await client.getActor(actorId);
        if (!actor) {
            return Response.json({ error: 'Actor not found' }, { status: 404 });
        }

        const adapter = new MorkBorgAdapter();
        const result = await adapter.createDecoctions(actor, client, { rollMode });

        return Response.json({ success: true, result });
    } catch (e: any) {
        logger.error(`[brew-decoctions] Failed: ${e.message}`);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
