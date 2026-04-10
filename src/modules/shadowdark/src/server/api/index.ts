import { shadowdarkAdapter } from '../ShadowdarkAdapter';
import { logger } from '@shared/utils/logger';

export async function handleIndex(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const systemData = await shadowdarkAdapter.getSystemData(client);
        return Response.json(systemData);
    } catch (e: any) {
        logger.error('Failed to get Shadowdark system data', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
