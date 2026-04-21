import { shadowdarkAdapter } from '../ShadowdarkAdapter';
import { logger } from '@shared/utils/logger';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';

/**
 * Generic handler to fetch a categorized collection from the warmed system cache.
 * Supports canonical names like 'ancestries', 'backgrounds', 'classes', etc.
 */
export async function handleGetCollection(request: Request, id: string, client: any) {
    try {
        const url = new URL(request.url, 'http://localhost');
        const summary = url.searchParams.get('summary') === 'true';

        logger.debug(`Shadowdark API | Fetching collection: ${id} (summary: ${summary})`);
        
        const collection = await shadowdarkAdapter.getCollection(id, { summary });
        
        if (!collection || collection.length === 0) {
            // Check if it's a valid collection via the index
            const index = await shadowdarkAdapter.getRegistryIndex();
            const exists = Object.keys(index).some(uuid => uuid.includes(`.${id}.`));
            
            if (!exists && !['spells', 'gear', 'talents'].includes(id)) {
                logger.warn(`Shadowdark API | Collection not found: ${id}`);
                return Response.json({ error: `Collection '${id}' not found` }, { status: 404 });
            }
        }

        return Response.json(collection);
    } catch (error: unknown) {
        logger.error(`Shadowdark API | Failed to get collection ${id}`, error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
