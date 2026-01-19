import { ModuleManifest, SystemAdapter } from './interfaces';
import shadowdark from '../shadowdark';
import morkborg from '../morkborg';
import generic from '../generic';
import dnd5e from '../dnd5e';

// Register all modules here
const modules: ModuleManifest[] = [
    shadowdark,
    morkborg,
    dnd5e,
    generic
];

const moduleMap = new Map<string, ModuleManifest>();
modules.forEach(m => {
    moduleMap.set(m.info.id, m);
    // Also map aliases if needed? 
    // Mork Borg alias might be needed
    if (m.info.id === 'morkborg') {
        moduleMap.set('mork-borg', m);
    }
});

export const getAdapter = (systemId: string): SystemAdapter | null => {
    const manifest = moduleMap.get(systemId) || moduleMap.get('generic');
    if (!manifest) return null;
    return new manifest.adapter();
};

export const getSheet = (systemId: string) => {
    const manifest = moduleMap.get(systemId) || moduleMap.get('generic');
    return manifest?.sheet;
};


export const getMatchingAdapter = (actor: any): SystemAdapter => {
    // 1. Try explicit systemId match from the actor data
    if (actor.systemId) {
        const exact = getAdapter(actor.systemId);
        if (exact && exact.systemId !== 'generic') return exact;
    }

    // 2. Iterate all adapters to find a heuristic match
    for (const m of modules) {
        // Skip generic for matching
        if (m.info.id === 'generic') continue;

        const adapter = new m.adapter();
        if (adapter.match(actor)) {
            return adapter;
        }
    }

    // 3. Fallback to generic
    return getAdapter('generic')!;
};

export const getTool = (systemId: string, toolId: string) => {
    const manifest = moduleMap.get(systemId);
    if (!manifest || !manifest.tools) return null;
    return manifest.tools[toolId];
};
