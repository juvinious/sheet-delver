import { ComponentType, LazyExoticComponent } from 'react';
import { ServerConnectionStatus } from './connection';

export type { ServerConnectionStatus };

export interface SystemInfo {
    id: string;
    title: string;
    version: string;
    worldTitle?: string;
    worldBackground?: string;
    worldDescription?: string;
    nextSession?: string | null;
    /**
     * Auth state is separate from connection status. 
     * true = user is explicitly logged in. 
     * false = guest or unauthenticated.
     */
    isLoggedIn?: boolean;
    background?: string;
    users?: { active: number; total: number; list?: any[] };
    status?: ServerConnectionStatus;
    worlds?: any[];
    theme?: any;
    config?: any;
}
export interface ActorSheetData {
    id: string;
    name: string;
    type: string;
    img: string;
    system?: any;
    items?: any[];
    effects?: any[];
    [key: string]: any;
}

/**
 * System configuration provided to the UI.
 */
export interface SystemConfig {
    id: string;
    title: string;
    [key: string]: any;
}

/**
 * Core application configuration.
 */
export interface AppConfig {
    app: {
        host: string;
        port: number;
        protocol: string;
        chatHistory: number;
        version: string;
    };
    foundry: {
        host: string;
        port: number;
        protocol: string;
        url: string;
        username?: string;
        password?: string;
        userId?: string;
        connector?: string;
    };
    debug: {
        enabled: boolean;
        level: number;
    };
}

/**
 * Interface that all RPG system adapters must implement.
 */
export interface SystemAdapter {
    systemId: string;
    normalizeActorData(actor: any): ActorSheetData;
    getRollData(actor: any, type: string, key: string, options?: any): any;
    match(actor: any): boolean;
    renderNavigation?: boolean;
    getSystemData(client: any): Promise<any>;
    postCreate?(client: any, actorId: string, sourceData: any): Promise<void>;
    getActor?(client: any, actorId: string): Promise<any>;
    resolveActorNames?(actor: any, cache: any): void;
    loadSupplementaryData?(cache: any): Promise<void>;
    theme?: {
        bg?: string;
        panelBg?: string;
        text?: string;
        accent?: string;
        button?: string;
        headerFont?: string;
        input?: string;
        success?: string;
    };
    componentStyles?: {
        chat?: {
            container?: string;
            header?: string;
            msgContainer?: (isRoll: boolean) => string;
            user?: string;
            time?: string;
            flavor?: string;
            content?: string;
            rollResult?: string;
            rollFormula?: string;
            rollTotal?: string;
            button?: string;
            buttonText?: string;
            buttonValue?: string;
        };
        diceTray?: {
            container?: string;
            header?: string;
            textarea?: string;
            clearBtn?: string;
            diceRow?: string;
            diceBtn?: string;
            modGroup?: string;
            modBtn?: string;
            advGroup?: string;
            advBtn?: (active: boolean, type: 'normal' | 'adv' | 'dis') => string;
            sendBtn?: string;
            helpText?: string;
            button?: string;
            input?: string;
        };
    };
}

/**
 * Manifest for pluggable system modules.
 */
export interface ModuleManifest {
    info: {
        id: string;
        title: string;
    };
    adapter: new () => SystemAdapter;
    sheet: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
    tools?: Record<string, LazyExoticComponent<ComponentType<any>> | ComponentType<any>>;
}
