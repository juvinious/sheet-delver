import { shadowdarkAdapter } from '../ShadowdarkAdapter';
import { logger } from '@shared/utils/logger';

export async function handleIndex(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const systemData = await shadowdarkAdapter.getSystemData(client);
        
        logger.debug(`[ShadowdarkAPI] Responding with system data. Keys: ${Object.keys(systemData || {}).join(', ')}, IndexSize: ${Object.keys(systemData?.nameIndex || {}).length}`);
        
        return Response.json(systemData);
    } catch (e: any) {
        logger.error('Failed to get Shadowdark system data', e);
        return Response.json({ error: e.message }, { status: 500 });
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
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
