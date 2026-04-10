/**
 * Mörk Borg Module API - Actor Data Handler
 * Fetches complete actor data including computed values and categorized items
 */

import { MorkBorgAdapter } from './MorkBorgAdapter';

export async function handleGetActorData(actorId: string, client: any) {
    if (!client) {
        throw new Error('Client context is required for handleGetActorData');
    }

    try {
        // Fetch raw actor data from Foundry
        const rawActor = await client.getActor(actorId);
        if (!rawActor) {
            throw new Error(`Actor with ID ${actorId} not found`);
        }

        // Use adapter to compute derived data
        const adapter = new MorkBorgAdapter();
        const computed = adapter.computeActorData(rawActor);
        const items = adapter.categorizeItems(rawActor);

        // Return complete actor data
        return Response.json({
            actor: {
                _id: rawActor._id || rawActor.id,
                name: rawActor.name,
                img: rawActor.img,
                type: rawActor.type,
                system: rawActor.system,
                computed,
                items
            }
        });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
