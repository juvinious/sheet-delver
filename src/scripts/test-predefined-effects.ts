import { getAdapter } from '../modules/core/registry.js';
import { ShadowdarkAdapter } from '../modules/shadowdark/system.js';

async function test() {
    console.log("--- Integrated Adapter Test ---");

    // 1. Test shadowdark via Registry
    const adapter = getAdapter('shadowdark');
    console.log("SystemID: shadowdark");
    console.log("Adapter Class:", adapter?.constructor.name);

    const hasMethodRegistry = typeof (adapter as any)?.getPredefinedEffects === 'function';
    console.log("getPredefinedEffects exists (Registry):", hasMethodRegistry);

    if (adapter && hasMethodRegistry) {
        try {
            const effects = await (adapter as any).getPredefinedEffects(null);
            console.log("Effects count (Registry):", effects.length);
        } catch (e: any) {
            console.error("Error calling getPredefinedEffects (Registry):", e.message);
        }
    }

    // 2. Test shadowdark Direct
    console.log("\n--- Direct Instantiation Test ---");
    const direct = new ShadowdarkAdapter();
    console.log("Direct Class:", direct.constructor.name);
    const hasMethodDirect = typeof (direct as any).getPredefinedEffects === 'function';
    console.log("getPredefinedEffects exists (Direct):", hasMethodDirect);

    if (hasMethodDirect) {
        try {
            const effects = await direct.getPredefinedEffects();
            console.log("Effects count (Direct):", effects.length);
        } catch (e: any) {
            console.error("Error calling getPredefinedEffects (Direct):", e.message);
        }
    }

    // 3. Test generic fallback
    console.log("\n--- Generic Fallback Test ---");
    const generic = getAdapter('unknown-system');
    console.log("SystemID: unknown-system");
    console.log("Adapter Class:", generic?.constructor.name);
    console.log("getPredefinedEffects exists (Generic):", typeof (generic as any)?.getPredefinedEffects === 'function');
}

test().catch(err => {
    console.error("Test Failed:", err);
    process.exit(1);
});
