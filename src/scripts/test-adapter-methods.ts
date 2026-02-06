// import { getAdapter } from '../modules/core/registry.ts';
import { ShadowdarkAdapter } from '../modules/shadowdark/system.ts';

console.log("--- DEBUGGING SHADOWDARK ADAPTER DIRECTLY ---");

/*
// 1. Check Registry Retrieval (Skipped for now)
const adapter = getAdapter('shadowdark');
console.log('Registry getAdapter("shadowdark") returned:', adapter ? adapter.constructor.name : 'null');

if (adapter) {
    console.log('System ID:', adapter.systemId);
    console.log('Has getPredefinedEffects (typeof):', typeof (adapter as any).getPredefinedEffects);
    // @ts-ignore
    console.log('Has getPredefinedEffects (in key check):', 'getPredefinedEffects' in adapter);
    // @ts-ignore
    console.log('Prototype has getPredefinedEffects:', 'getPredefinedEffects' in Object.getPrototypeOf(adapter));
}
*/

// 2. Check Direct Instantiation
console.log("\n--- DIRECT INSTANTIATION ---");
const direct = new ShadowdarkAdapter();
console.log('Direct Instance:', direct.constructor.name);
console.log('Direct Instance has getPredefinedEffects (typeof):', typeof (direct as any).getPredefinedEffects);
console.log('Direct Instance proto has getPredefinedEffects:', 'getPredefinedEffects' in Object.getPrototypeOf(direct));
