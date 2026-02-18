import { ComponentType, LazyExoticComponent } from 'react';
import { ServerConnectionStatus } from './connection';

export type { ServerConnectionStatus };

export interface SystemInfo {
    id: string;
    title: string;
    version: string;
    appVersion?: string;
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
    componentStyles?: SystemAdapter['componentStyles'];
}
export interface ActorSheetData {
    id: string;
    name: string;
    type: string;
    img: string;
    system?: any;
    items?: any[];
    effects?: any[];
    derived?: any;
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
        apiPort: number;
        protocol: string;
        chatHistory: number;
        version: string;
        url: string;
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
        foundryDataDirectory?: string;
    };
    debug: {
        enabled: boolean;
        level: number;
    };
    security: {
        rateLimit: {
            enabled: boolean;
            windowMinutes: number;
            maxAttempts: number;
        };
    };
}

export type RollMode = 'publicroll' | 'gmroll' | 'blindroll' | 'selfroll';

/**
 * Interface that all RPG system adapters must implement.
 */
export interface SystemAdapter {
    systemId: string;
    normalizeActorData(actor: any, client?: any): ActorSheetData;
    getRollData(actor: any, type: string, key: string, options?: { rollMode?: RollMode;[key: string]: any }): any;
    match(actor: any): boolean;
    renderNavigation?: boolean;
    getSystemData(client: any, options?: { minimal?: boolean }): Promise<any>;
    postCreate?(client: any, actorId: string, sourceData: any): Promise<void>;
    getActor?(client: any, actorId: string): Promise<any>;
    resolveDocument?(client: any, uuid: string): Promise<any | null>;
    resolveActorNames?(actor: any, cache: any): void;
    loadSupplementaryData?(cache: any): Promise<void>;
    expandTableResults?(client: any, table: any): Promise<any[] | null>;
    validateUpdate?(path: string, value: any): boolean;
    /**
     * Optional: Calculate derived/computed stats from normalized actor data.
     * Called by the core /api/actors/:id endpoint after normalizeActorData.
     * Use this for values derived from system data (HP totals, AC, encumbrance, etc.)
     */
    computeActorData?(actor: any): any;
    /**
     * Optional: Categorize items by type for easier UI rendering.
     * Called by the core /api/actors/:id endpoint after normalizeActorData.
     * Return an object with named arrays (e.g. { weapons: [], armor: [], spells: [] })
     */
    categorizeItems?(actor: any): any;
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
            scrollButton?: string;
            inputContainer?: string;
            inputField?: string;
            sendBtn?: string;
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
        modal?: {
            overlay?: string;
            container?: string;
            header?: string;
            title?: string;
            body?: string;
            footer?: string;
            confirmBtn?: (isDanger?: boolean) => string;
            cancelBtn?: string;
            closeBtn?: string;
        };
        rollDialog?: {
            overlay?: string;
            container?: string;
            header?: string;
            title?: string;
            body?: string;
            inputGroup?: string;
            label?: string;
            input?: string;
            footer?: string;
            rollBtn?: (mode: 'normal' | 'adv' | 'dis') => string;
            closeBtn?: string;
            select?: string;
            selectArrow?: string;
        };
        loadingModal?: {
            overlay?: string;
            container?: string;
            spinner?: string;
            text?: string;
        };
        globalChat?: {
            window?: string;
            header?: string;
            title?: string;
            diceWindow?: string;
            chatWindow?: string;
            toggleBtn?: (isOpen: boolean, isDice?: boolean) => string;
            closeBtn?: string;
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
    /**
     * Optional: Module-specific actor page component.
     * When registered, the core /actors/[id] route will delegate rendering to this component.
     * Props: { actorId: string; token?: string | null }
     */
    actorPage?: LazyExoticComponent<ComponentType<{ actorId: string; token?: string | null }>> | ComponentType<{ actorId: string; token?: string | null }>;
}
