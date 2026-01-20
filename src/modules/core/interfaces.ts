import { ComponentType, LazyExoticComponent } from 'react';

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

export interface SystemAdapter {
    systemId: string;
    normalizeActorData(actor: any): ActorSheetData;
    getRollData(actor: any, type: string, key: string, options?: any): any;

    /**
     * Checks if the given actor data matches this system adapter.
     */
    match(actor: any): boolean;
    /**
     * Whether the core application should render its default navigation and shell.
     * Defaults to true. Set to false if the sheet handles its own full-page layout.
     */
    renderNavigation?: boolean;

    getSystemData(client: any): Promise<any>;

    /**
     * Optional hook to run after an actor is created.
     * Useful for linking items, normalizing data, or applying default effects.
     * Executes in the Node context, so use `client.evaluate` or similar to touch Foundry.
     */
    postCreate?(client: any, actorId: string, sourceData: any): Promise<void>;

    /**
     * Optional theme configuration for the client UI.
     */
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
}

export interface ModuleManifest {
    info: {
        id: string; // matches foundry system.id
        title: string;
    };
    adapter: new () => SystemAdapter; // Constructor
    sheet: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
    tools?: Record<string, LazyExoticComponent<ComponentType<any>> | ComponentType<any>>;
}
