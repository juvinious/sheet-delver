import { ModuleManifest, SystemAdapter, UIModuleManifest } from '@/modules/registry';
import { logger } from '@/core/logger';

// Static Module Metadata Imports (Safe for all environments)
import shadowdarkInfo from '../shadowdark/info.json';
import morkborgInfo from '../morkborg/info.json';
import dnd5eInfo from '../dnd5e/info.json';
import genericInfo from '../generic/info.json';

// Static UI Manifest Imports (Safe for Browser)
import shadowdarkUI from '../shadowdark/module/ui';
import morkborgUI from '../morkborg/module/ui';
import dnd5eUI from '../dnd5e/module/ui';
import genericUI from '../generic/module/ui';


interface SystemPlugin {
    info: {
        id: string;
        title: string;
        aliases?: string[];
        manifest: {
            ui: string;
            logic: string;
            server?: string;
        }
    };
    ui: UIModuleManifest; // We keep UI manifest static for React.lazy/Next.js bundling
    getLogic: () => Promise<any>;
    getServer?: () => Promise<any>;
}

const PLUGINS: SystemPlugin[] = [
    {
        info: shadowdarkInfo,
        ui: shadowdarkUI,
        getLogic: () => import('../shadowdark/module/logic'),
        // Explicitly gate server-side imports to prevent bundlers from traversing Node.js dependencies
        getServer: typeof window === 'undefined' ? () => import('../shadowdark/module/server') : undefined
    },
    {
        info: morkborgInfo,
        ui: morkborgUI,
        getLogic: () => import('../morkborg/module/logic'),
        getServer: typeof window === 'undefined' ? () => import('../morkborg/module/server') : undefined
    },
    {
        info: dnd5eInfo,
        ui: dnd5eUI,
        getLogic: () => import('../dnd5e/module/logic'),
    },
    {
        info: genericInfo,
        ui: genericUI,
        getLogic: () => import('../generic/module/logic'),
    }
];

// Automated ID & Alias Mapping from info.json
const pluginMap = new Map<string, SystemPlugin>();

PLUGINS.forEach(p => {
    const primaryId = p.info.id.toLowerCase();
    pluginMap.set(primaryId, p);

    if (Array.isArray(p.info.aliases)) {
        p.info.aliases.forEach(alias => {
            pluginMap.set(alias.toLowerCase(), p);
        });
    }
});

const adapterInstances = new Map<string, SystemAdapter>();

/**
 * Returns the UI Manifest for a given system.
 */
export function getUIModule(systemId: string): UIModuleManifest | undefined {
    const plugin = pluginMap.get(systemId.toLowerCase()) || pluginMap.get('generic');
    return plugin?.ui;
}

// RESTORED CONVENIENCE APIS
export function getSheet(systemId: string) {
    return getUIModule(systemId)?.sheet;
}

export function getRollModal(systemId: string) {
    return getUIModule(systemId)?.rollModal;
}

export function getActorPage(systemId: string) {
    return getUIModule(systemId)?.actorPage;
}

export function getTools(systemId: string) {
    return getUIModule(systemId)?.tools;
}

export function getDashboardLoading(systemId: string) {
    return getUIModule(systemId)?.dashboardLoading;
}

export function getDashboardTools(systemId: string) {
    return getUIModule(systemId)?.dashboardTools;
}

/**
 * Returns the Logic Adapter for a given system.
 * Thunk-based lazy loading ensures zero evaluation for inactive systems.
 */
export async function getAdapter(systemId: string): Promise<SystemAdapter | null> {
    const id = systemId.toLowerCase();
    if (adapterInstances.has(id)) return adapterInstances.get(id)!;

    const plugin = pluginMap.get(id) || pluginMap.get('generic');
    if (!plugin) return null;

    try {
        const module = await plugin.getLogic();

        // Standardized 'Adapter' export from module/logic.ts
        const AdapterClass = module.Adapter || module.default;

        if (!AdapterClass) {
            logger.error(`Registry | No Adapter class found for ${id}`);
            return null;
        }

        const adapter = new AdapterClass();
        if (typeof (adapter as any).initialize === 'function') {
            await (adapter as any).initialize();
        }
        adapterInstances.set(id, adapter);
        return adapter;
    } catch (e) {
        logger.error(`Registry | Failed to load adapter for ${id}:`, e);
        return null;
    }
}

/**
 * Alias for getAdapter to support "getLogic" terminology from user request.
 */
export const getLogic = getAdapter;

/**
 * Returns the Server-side API module for a given system.
 * Loaded only when explicitly requested.
 */
export async function getServerModule(systemId: string) {
    const plugin = pluginMap.get(systemId.toLowerCase());
    if (!plugin || !plugin.getServer) return null;
    try {
        return await plugin.getServer();
    } catch (e) {
        logger.error(`Registry | Failed to load server module for ${systemId}:`, e);
        return null;
    }
}

/**
 * Alias for getServerModule to support "getServer" terminology from user request.
 */
export const getServer = getServerModule;

/**
 * Generic Helper: Returns system-specific dashboard tools if present.
 */
export function getSystemToolsComponent(systemId: string) {
    return getUIModule(systemId)?.dashboardTools;
}

/**
 * Asynchronously finds the correct adapter for an actor object.
 */
export async function getMatchingAdapter(actor: any): Promise<SystemAdapter> {
    const genericAdapter = (await getAdapter('generic'))!;
    if (!actor) return genericAdapter;

    if (actor.systemId) {
        const exact = await getAdapter(actor.systemId);
        if (exact && exact.systemId !== 'generic') return exact;
    }

    // Since we need to match, we have to check adapters
    for (const plugin of PLUGINS) {
        if (plugin.info.id === 'generic') continue;
        const adapter = await getAdapter(plugin.info.id);
        if (adapter && adapter.match(actor)) return adapter;
    }

    return genericAdapter;
}

export const getModuleConfig = (systemId: string) => {
    return pluginMap.get(systemId.toLowerCase())?.info;
};

/**
 * Deprecated: Use getUIModule or getAdapter instead.
 */
export const getModule = async (systemId: string) => {
    const ui = getUIModule(systemId);
    const adapter = await getAdapter(systemId);

    return {
        ...ui,
        adapter
    };
};
