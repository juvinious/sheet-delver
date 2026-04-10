import { SystemAdapter, SystemPlugin } from './types';
export * from './utils';
import { logger } from '@shared/utils/logger';
import path from 'node:path';
import fs from 'node:fs';

// In-Memory Cache for Discovered Modules & Active Adapters
// These are private to the server entry point to prevent external leakage
const pluginMap = new Map<string, SystemPlugin>();
const adapterInstances = new Map<string, SystemAdapter>();
let isInitialized = false;

/**
 * Boot-Time Scanner: Discovers all modules in src/modules/
 * Uses Node.js 'fs' to build the initial system index.
 */
export function initializeRegistry() {
    if (typeof window !== 'undefined' || isInitialized) return;

    try {
        const modulesDir = path.join(process.cwd(), 'src', 'modules');

        if (!fs.existsSync(modulesDir)) {
            logger.error(`Registry | Modules directory not found: ${modulesDir}`);
            return;
        }

        const entries = fs.readdirSync(modulesDir, { withFileTypes: true });

        for (const entry of entries) {
            // Skip the registry itself and non-directories
            if (!entry.isDirectory() || entry.name === 'registry') continue;

            const modulePath = path.join(modulesDir, entry.name);
            const infoPath = path.join(modulePath, 'info.json');

            if (!fs.existsSync(infoPath)) {
                logger.warn(`Registry | Skipping folder "${entry.name}": Missing info.json manifest.`);
                continue;
            }

            try {
                const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                const plugin: SystemPlugin = {
                    info,
                    directory: entry.name,
                    // Thunk-based lazy loading for system modules
                    getLogic: () => import(`@modules/${entry.name}/${info.manifest.logic}`),
                    getUI: () => import(`@modules/${entry.name}/${info.manifest.ui}`),
                    getServer: info.manifest.server ? () => import(`@modules/${entry.name}/${info.manifest.server}`) : undefined
                };

                const primaryId = info.id.toLowerCase();
                pluginMap.set(primaryId, plugin);

                // Register aliases if provided
                if (Array.isArray(info.aliases)) {
                    info.aliases.forEach((alias: string) => pluginMap.set(alias.toLowerCase(), plugin));
                }

                logger.info(`Registry | Discovered module: ${info.title} (${primaryId}) at /modules/${entry.name}`);
            } catch (err) {
                logger.error(`Registry | Failed to parse manifest for "${entry.name}":`, err);
            }
        }

        isInitialized = true;
    } catch (err) {
        logger.error('Registry | Fatal error during boot-time discovery:', err);
    }
}

/**
 * Returns all discovered system manifests.
 * Used by the Core Service to expose available systems to the frontend.
 */
export function getRegisteredModules() {
    // Return unique plugin info objects
    return Array.from(new Set(pluginMap.values())).map(p => p.info);
}

/**
 * JIT Logic Adapter Loader
 * Loads and instantiates the Logic Adapter for a given systemId.
 */
export async function getAdapter(systemId: string): Promise<SystemAdapter | null> {
    const id = systemId.toLowerCase();
    
    // Return cached instance if available
    if (adapterInstances.has(id)) return adapterInstances.get(id)!;

    // Ensure discovery has run
    if (!isInitialized) initializeRegistry();

    const plugin = pluginMap.get(id) || pluginMap.get('generic');
    if (!plugin) return null;

    try {
        const module = await plugin.getLogic();
        const AdapterClass = module.Adapter || module.default;

        if (!AdapterClass) {
            logger.error(`Registry | No Adapter class found for ${id}`);
            return null;
        }

        const adapter = new AdapterClass();
        
        // Optional initialization hook for adapters (e.g., cache warming)
        if (typeof (adapter as any).initialize === 'function') {
            await (adapter as any).initialize();
        }
        
        adapterInstances.set(id, adapter);
        return adapter;
    } catch (e) {
        logger.error(`Registry | Failed to JIT load adapter for ${id}:`, e);
        return null;
    }
}

/**
 * JIT Server-Side API Loader
 * Loads specialized server-side routes or handlers for a system.
 */
export async function getServerModule(systemId: string) {
    if (!isInitialized) initializeRegistry();

    const plugin = pluginMap.get(systemId.toLowerCase());
    if (!plugin || !plugin.getServer) return null;
    
    try {
        return await plugin.getServer();
    } catch (e) {
        logger.error(`Registry | Failed to JIT load server module for ${systemId}:`, e);
        return null;
    }
}

/**
 * Service Lifecycle: Explicitly Unload Modules
 * Clears cached instances for a specific system or all systems.
 */
export function unloadSystemModules(systemId?: string) {
    if (systemId) {
        const id = systemId.toLowerCase();
        logger.info(`Registry | Unloading modules for ${id}`);
        adapterInstances.delete(id);
    } else {
        logger.info('Registry | Purging all active module instances');
        adapterInstances.clear();
    }
}

/**
 * Asynchronously finds the correct adapter for an actor object based on matching rules.
 */
export async function getMatchingAdapter(actor: any): Promise<SystemAdapter> {
    const genericAdapter = (await getAdapter('generic'))!;
    if (!actor) return genericAdapter;

    if (actor.systemId) {
        const exact = await getAdapter(actor.systemId);
        if (exact && exact.systemId !== 'generic') return exact;
    }

    if (!isInitialized) initializeRegistry();

    for (const plugin of pluginMap.values()) {
        if (plugin.info.id === 'generic') continue;
        const adapter = await getAdapter(plugin.info.id);
        if (adapter && adapter.match(actor)) return adapter;
    }

    return genericAdapter;
}
