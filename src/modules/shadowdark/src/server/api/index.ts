import { shadowdarkAdapter } from '../ShadowdarkAdapter';
import { getModuleFoundryClient } from '@server/shared/utils/getModuleFoundryClient';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { logger } from '@shared/utils/logger';

export async function handleIndex(request: Request) {
    try {
        const client = getModuleFoundryClient(request);
        const systemData = await shadowdarkAdapter.getSystemData(client);
        
        logger.debug(`[ShadowdarkAPI] Responding with system data. Keys: ${Object.keys(systemData || {}).join(', ')}, IndexSize: ${Object.keys(systemData?.nameIndex || {}).length}`);
        
        return Response.json(systemData);
    } catch (error: unknown) {
        logger.error('Failed to get Shadowdark system data', error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function handleDebugRegistry(request: Request) {
    try {
        const adapter: any = shadowdarkAdapter;
        const registry = adapter._registry;
        const state = registry._state;
        
        const counts: Record<string, number> = {};
        for (const key of Object.keys(state.collections)) {
            counts[key] = state.collections[key]?.length || 0;
        }
        
        return Response.json({
            indexSize: Object.keys(state.nameIndex).length,
            collections: counts,
            lastFetch: state.lastFetch,
            isFresh: (Date.now() - state.lastFetch) < 300000 
        });
    } catch (error: unknown) {
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
