import { SystemAdapter, UIModuleManifest } from '@shared/interfaces';
import type { DiscoveryConfig } from '@shared/interfaces';
export type { ModuleLifecycleRecord, ModuleLifecycleStatus, ModuleLifecycleStore } from './lifecycle';

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

export interface DiscoveryConfigProviderAdapter {
    getDiscoveryConfig(): DiscoveryConfig;
}

export interface InitializableAdapter {
    initialize(client?: unknown): Promise<void>;
}

export function hasDiscoveryConfig(
    adapter: SystemAdapter | null
): adapter is SystemAdapter & DiscoveryConfigProviderAdapter {
    return typeof adapter?.getDiscoveryConfig === 'function';
}

export function hasInitialize(
    adapter: SystemAdapter | null
): adapter is SystemAdapter & InitializableAdapter {
    return typeof adapter?.initialize === 'function';
}

export type { SystemAdapter, UIModuleManifest };
