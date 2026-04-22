import { hasInitialize, SystemAdapter, SystemModuleInfo, SystemPlugin } from './types';
export * from './utils';
import { logger } from '@shared/utils/logger';
import path from 'node:path';
import fs from 'node:fs';
import {
    applyLifecycleClassification,
    createEmptyLifecycleStore,
    getLifecycleRecords,
    loadLifecycleStore,
    ModuleLifecycleStore,
    saveLifecycleStore,
    upsertDiscoveredModule
} from './lifecycle';
import { evaluateModuleCompatibility, validateModuleInfoShape } from './validation';

interface RegistryState {
    pluginMap: Map<string, SystemPlugin>;
    adapterInstances: Map<string, any>;
    isInitialized: boolean;
    lifecycleStore: ModuleLifecycleStore;
}

// In-Memory Cache for Discovered Modules & Active Adapters
// Use globalThis to shared state across dual-loaded modules
const getGlobalState = (): RegistryState => {
    const g = globalThis as any;
    if (!g.__coreRegistry) {
        g.__coreRegistry = {
            pluginMap: new Map<string, SystemPlugin>(),
            adapterInstances: new Map<string, any>(),
            isInitialized: false,
            lifecycleStore: createEmptyLifecycleStore()
        };
    }
    return g.__coreRegistry;
};

const _state = getGlobalState();
const pluginMap = _state.pluginMap;
const adapterInstances = _state.adapterInstances;
const lifecycleStore = _state.lifecycleStore;
const isInitialized = () => _state.isInitialized;
const setInitialized = (val: boolean) => { _state.isInitialized = val; };

const getUniquePlugins = () => Array.from(new Set(pluginMap.values()));

function getCoreVersion(): string {
    try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: unknown };
        return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/**
 * Boot-Time Scanner: Discovers all modules in src/modules/
 * Uses Node.js 'fs' to build the initial system index.
 */
export function initializeRegistry() {
    if (typeof window !== 'undefined' || isInitialized()) return;

    try {
        const loadedStore = loadLifecycleStore();
        lifecycleStore.version = loadedStore.version;
        lifecycleStore.modules = loadedStore.modules;
        const coreVersion = getCoreVersion();

        const modulesDir = path.join(process.cwd(), 'src', 'modules');
        logger.info(`Registry [PID:${process.pid}] | Scanning modules directory: ${modulesDir} (CWD: ${process.cwd()})`);

        if (!fs.existsSync(modulesDir)) {
            logger.error(`Registry [PID:${process.pid}] | Modules directory NOT FOUND at: ${modulesDir}`);
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
                const moduleId = entry.name.toLowerCase();
                upsertDiscoveredModule(lifecycleStore, {
                    moduleId,
                    title: entry.name,
                    directory: entry.name
                });
                applyLifecycleClassification(lifecycleStore, moduleId, {
                    status: 'errored',
                    enabled: false,
                    reason: 'Missing info.json manifest',
                    manifestValid: false,
                    validationErrors: ['Missing info.json manifest'],
                    compatible: false,
                    coreVersion
                });
                continue;
            }

            try {
                const rawInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as unknown;
                const shapeValidation = validateModuleInfoShape(rawInfo);

                const fallbackId = entry.name.toLowerCase();
                const fallbackTitle = entry.name;
                const inferredId = (
                    typeof rawInfo === 'object'
                    && rawInfo !== null
                    && 'id' in rawInfo
                    && typeof (rawInfo as { id?: unknown }).id === 'string'
                )
                    ? String((rawInfo as { id: string }).id).toLowerCase()
                    : fallbackId;
                const inferredTitle = (
                    typeof rawInfo === 'object'
                    && rawInfo !== null
                    && 'title' in rawInfo
                    && typeof (rawInfo as { title?: unknown }).title === 'string'
                )
                    ? String((rawInfo as { title: string }).title)
                    : fallbackTitle;

                upsertDiscoveredModule(lifecycleStore, {
                    moduleId: inferredId,
                    title: inferredTitle,
                    directory: entry.name
                });

                if (!shapeValidation.valid) {
                    applyLifecycleClassification(lifecycleStore, inferredId, {
                        status: 'errored',
                        enabled: false,
                        reason: shapeValidation.errors.join('; '),
                        manifestValid: false,
                        validationErrors: shapeValidation.errors,
                        compatible: false,
                        coreVersion
                    });
                    logger.error(`Registry | Invalid manifest for "${entry.name}": ${shapeValidation.errors.join('; ')}`);
                    continue;
                }

                const info = rawInfo as SystemModuleInfo;
                const compatibility = evaluateModuleCompatibility(info, coreVersion);

                if (!compatibility.compatible) {
                    applyLifecycleClassification(lifecycleStore, inferredId, {
                        status: 'incompatible',
                        enabled: false,
                        reason: compatibility.reason || 'Incompatible with current core version',
                        manifestValid: true,
                        compatible: false,
                        coreVersion: compatibility.coreVersion,
                        requiredCoreVersion: compatibility.requiredCoreVersion
                    });
                    logger.warn(`Registry | Module "${entry.name}" is incompatible: ${compatibility.reason || 'unknown reason'}`);
                    continue;
                }

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
                const existingLifecycle = lifecycleStore.modules[primaryId];
                const enabled = existingLifecycle ? existingLifecycle.enabled : true;
                applyLifecycleClassification(lifecycleStore, primaryId, {
                    status: enabled ? 'validated' : 'disabled',
                    enabled,
                    reason: enabled ? undefined : 'Module disabled in persisted lifecycle state',
                    manifestValid: true,
                    compatible: true,
                    coreVersion,
                    requiredCoreVersion: compatibility.requiredCoreVersion
                });
                logger.info(`Registry [PID:${process.pid}] | Discovered module: ${info.title} (${primaryId})`);
                if (info.experimental) {
                    logger.warn(`Registry [PID:${process.pid}] | Experimental module hidden from public registry: ${info.title} (${primaryId})`);
                }
            } catch (err) {
                logger.error(`Registry | Failed to parse manifest for "${entry.name}":`, err);
            }
        }

        saveLifecycleStore(lifecycleStore);
        setInitialized(true);
    } catch (err) {
        logger.error('Registry | Fatal error during boot-time discovery:', err);
    }
}

export function getModuleLifecycleState() {
    if (!isInitialized()) initializeRegistry();
    return getLifecycleRecords(lifecycleStore);
}

/**
 * Returns all discovered system manifests.
 * Used by the Core Service to expose available systems to the frontend.
 */
export function getRegisteredModules(options?: { includeExperimental?: boolean }) {
    if (!isInitialized()) initializeRegistry();

    return getUniquePlugins()
        .map((plugin) => plugin.info)
        .filter((info) => options?.includeExperimental || !info.experimental);
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
    if (!isInitialized()) initializeRegistry();

    const plugin = pluginMap.get(id) || pluginMap.get('generic');
    if (!plugin) return null;

    try {
        const logicModule = await plugin.getLogic();
        const AdapterClass = logicModule.Adapter || logicModule.default;

        if (!AdapterClass) {
            logger.error(`Registry | No Adapter class found for ${id}`);
            return null;
        }

        const adapter = new AdapterClass();

        // Optional initialization hook for adapters (e.g., cache warming)
        if (hasInitialize(adapter)) {
            await adapter.initialize();
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
    if (!isInitialized()) initializeRegistry();

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

    if (!isInitialized()) initializeRegistry();

    for (const plugin of pluginMap.values()) {
        if (plugin.info.id === 'generic') continue;
        const adapter = await getAdapter(plugin.info.id);
        if (adapter && adapter.match(actor)) return adapter;
    }

    return genericAdapter;
}
