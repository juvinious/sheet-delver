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

export const getModuleInfo = (systemId: string) => {
    return moduleMap.get(systemId)?.info;
};
