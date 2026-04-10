
import { dataManager } from '../../data/DataManager';
import { logger } from '@shared/utils/logger';

export async function handleGetGear(request: Request): Promise<Response> {
    try {
        const client = (request as any).foundryClient;
        if (client) {
            const { shadowdarkAdapter } = await import('../../server/ShadowdarkAdapter');
            await shadowdarkAdapter.getSystemData(client);
        }

        const allDocs = await dataManager.getAllDocuments();

        logger.info(`[API] handleGetGear: Found ${allDocs.length} total documents.`);
        if (allDocs.length > 0) {
            const sample = allDocs.slice(0, 5).map(d => ({ name: d.name, type: d.type, pack: d.pack }));
            logger.info(`[API] handleGetGear: Sample items:`, JSON.stringify(sample));
        }

        return Response.json(allDocs);
    } catch (e) {
        logger.error('[API] Failed to get gear:', e);
        return Response.json({ error: 'Failed to fetch gear' }, { status: 500 });
    }
}
