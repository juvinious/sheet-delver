
import { dataManager } from '../data/DataManager';

export async function handleGetGear(request: Request): Promise<Response> {
    try {
        const allDocs = await dataManager.getAllDocuments();

        // Filter out non-item internal docs if any (though DataManager mostly handles this)
        // But we want to return everything so the client can filter by pack/folder

        return Response.json(allDocs);
    } catch (e) {
        console.error('[API] Failed to get gear:', e);
        return Response.json({ error: 'Failed to fetch gear' }, { status: 500 });
    }
}
