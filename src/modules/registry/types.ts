import { SystemAdapter, UIModuleManifest } from '@shared/interfaces';

export interface SystemModuleInfo {
    id: string;
    title: string;
    aliases?: string[];
    experimental?: boolean;
    manifest: {
        ui: string;
        logic: string;
        server?: string;
    };
    discovery?: import('@shared/interfaces').DiscoveryConfig;
}

/**
 * Registry Plugin Metadata
 * Defines how a discovered system module is represented in memory.
 */
export interface SystemPlugin {
    info: SystemModuleInfo;
    directory: string;
    getLogic: () => Promise<any>;
    getUI: () => Promise<any>;
    getServer?: () => Promise<any>;
}

export type { SystemAdapter, UIModuleManifest };
