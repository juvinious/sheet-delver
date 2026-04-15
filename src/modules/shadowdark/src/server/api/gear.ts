import { shadowdarkAdapter } from '../../server/ShadowdarkAdapter';
import { logger } from '@shared/utils/logger';

export async function handleGetGear(request: Request): Promise<Response> {
    try {
        const client = (request as any).foundryClient;
        
        // Ensure system data is warmed/available
        const systemData = await shadowdarkAdapter.getSystemData(client);

        // Aggregate gear and magic items from the cache
        const combinedGear = [
            ...(systemData.gear || []),
            ...(systemData.magicItems || [])
        ];

        logger.info(`[API] handleGetGear: Returning ${combinedGear.length} combined items from cache.`);
        
        return Response.json(combinedGear);
    } catch (e) {
        logger.error('[API] Failed to get gear:', e);
        return Response.json({ error: 'Failed to fetch gear' }, { status: 500 });
    }
}
