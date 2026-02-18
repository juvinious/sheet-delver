import { ModuleManifest, SystemAdapter } from './interfaces';
import { logger } from '../../core/logger';
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
    if (!actor) return getAdapter('generic')!;

    const actorName = actor.name || 'Unknown';
    const actorId = actor.id || actor._id || 'unknown';

    // 1. Try explicit systemId match from the actor data
    if (actor.systemId) {
        const exact = getAdapter(actor.systemId);
        if (exact && exact.systemId !== 'generic') {
            logger.debug(`[Registry] Matched ${actorName} (${actorId}) via explicit systemId: ${actor.systemId}`);
            return exact;
        }
    }

    // 2. Iterate all adapters to find a heuristic match
    for (const m of modules) {
        // Skip generic for matching
        if (m.info.id === 'generic') continue;

        const adapter = new m.adapter();
        if (adapter.match(actor)) {
            logger.debug(`[Registry] Matched ${actorName} (${actorId}) via heuristic: ${m.info.id}`);
            return adapter;
        }
    }

    // 3. Fallback to generic
    const keys = actor.system ? Object.keys(actor.system) : 'no system';
    logger.debug(`[Registry] No match for ${actorName} (${actorId}). Keys present: ${JSON.stringify(keys)}. Falling back to generic.`);
    return getAdapter('generic')!;
};

export const getTool = (systemId: string, toolId: string) => {
    const manifest = moduleMap.get(systemId);
    if (!manifest || !manifest.tools) return null;
    return manifest.tools[toolId];
};

export const getModuleConfig = (systemId: string) => {
    const manifest = moduleMap.get(systemId);
    return manifest?.info;
};

/**
 * Get the full module manifest for a given systemId.
 * Used by the core actor page router to find module-specific actorPage components.
 */
export const getModule = (systemId: string): ModuleManifest | undefined => {
    return moduleMap.get(systemId);
};
