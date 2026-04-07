// import { getAdapter } from '../modules/core/registry.ts';
import { ShadowdarkAdapter } from '../modules/shadowdark/system.ts';

logger.info("--- DEBUGGING SHADOWDARK ADAPTER DIRECTLY ---");

/*
// 1. Check Registry Retrieval (Skipped for now)
const adapter = getAdapter('shadowdark');
logger.info('Registry getAdapter("shadowdark") returned:', adapter ? adapter.constructor.name : 'null');

if (adapter) {
    logger.info('System ID:', adapter.systemId);
    logger.info('Has getPredefinedEffects (typeof):', typeof (adapter as any).getPredefinedEffects);
    // @ts-ignore
    logger.info('Has getPredefinedEffects (in key check):', 'getPredefinedEffects' in adapter);
    // @ts-ignore
    logger.info('Prototype has getPredefinedEffects:', 'getPredefinedEffects' in Object.getPrototypeOf(adapter));
}
*/

// 2. Check Direct Instantiation
logger.info("\n--- DIRECT INSTANTIATION ---");
const direct = new ShadowdarkAdapter();
logger.info('Direct Instance:', direct.constructor.name);
logger.info('Direct Instance has getPredefinedEffects (typeof):', typeof (direct as any).getPredefinedEffects);
logger.info('Direct Instance proto has getPredefinedEffects:', 'getPredefinedEffects' in Object.getPrototypeOf(direct));
