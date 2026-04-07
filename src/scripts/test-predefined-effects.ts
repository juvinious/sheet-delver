import { getAdapter } from '../modules/core/registry.js';
import { ShadowdarkAdapter } from '../modules/shadowdark/system.js';

async function test() {
    logger.info("--- Integrated Adapter Test ---");

    // 1. Test shadowdark via Registry
    const adapter = getAdapter('shadowdark');
    logger.info("SystemID: shadowdark");
    logger.info("Adapter Class:", adapter?.constructor.name);

    const hasMethodRegistry = typeof (adapter as any)?.getPredefinedEffects === 'function';
    logger.info("getPredefinedEffects exists (Registry):", hasMethodRegistry);

    if (adapter && hasMethodRegistry) {
        try {
            const effects = await (adapter as any).getPredefinedEffects(null);
            logger.info("Effects count (Registry):", effects.length);
        } catch (e: any) {
            logger.error("Error calling getPredefinedEffects (Registry):", e.message);
        }
    }

    // 2. Test shadowdark Direct
    logger.info("\n--- Direct Instantiation Test ---");
    const direct = new ShadowdarkAdapter();
    logger.info("Direct Class:", direct.constructor.name);
    const hasMethodDirect = typeof (direct as any).getPredefinedEffects === 'function';
    logger.info("getPredefinedEffects exists (Direct):", hasMethodDirect);

    if (hasMethodDirect) {
        try {
            const effects = await direct.getPredefinedEffects();
            logger.info("Effects count (Direct):", effects.length);
        } catch (e: any) {
            logger.error("Error calling getPredefinedEffects (Direct):", e.message);
        }
    }

    // 3. Test generic fallback
    logger.info("\n--- Generic Fallback Test ---");
    const generic = getAdapter('unknown-system');
    logger.info("SystemID: unknown-system");
    logger.info("Adapter Class:", generic?.constructor.name);
    logger.info("getPredefinedEffects exists (Generic):", typeof (generic as any)?.getPredefinedEffects === 'function');
}

test().catch(err => {
    logger.error("Test Failed:", err);
    process.exit(1);
});
