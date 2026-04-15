import { SystemAdapter, UIModuleManifest } from '@shared/interfaces';

/**
 * Registry Plugin Metadata
 * Defines how a discovered system module is represented in memory.
 */
export interface SystemPlugin {
    info: {
        id: string;
        title: string;
        aliases?: string[];
        manifest: {
            ui: string;
            logic: string;
            server?: string;
        },
        discovery?: import('@shared/interfaces').DiscoveryConfig
    };
    directory: string;
    getLogic: () => Promise<any>;
    getUI: () => Promise<any>;
    getServer?: () => Promise<any>;
}

export type { SystemAdapter, UIModuleManifest };
