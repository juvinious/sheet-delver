/**
 * Mörk Borg Module API - Items Handler
 * Manages actor items (categorized view)
 */

import { MorkBorgAdapter } from '../adapter';

export async function handleGetItems(actorId: string, client: any) {
    if (!client) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const rawActor = await client.getActor(actorId);
        if (!rawActor) {
            return Response.json({ error: 'Actor not found' }, { status: 404 });
        }

        const adapter = new MorkBorgAdapter();
        const items = adapter.categorizeItems(rawActor);

        return Response.json({ items });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function handleDeleteItem(actorId: string, itemId: string, client: any) {
    if (!client) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        // Delete item from actor
        await client.deleteItem(actorId, itemId);

        return Response.json({ success: true });
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
    }
}
