import { dataManager } from '../../data/DataManager';
import { logger } from '@shared/utils/logger';

export async function handleIndex(request: Request) {
    try {
        const index = await dataManager.getIndex();
        return Response.json(index);
    } catch (e: any) {
        logger.error('Failed to get Shadowdark index', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
