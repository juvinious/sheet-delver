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
     * Fetch actor data from the system. 
     * If not provided, the default client.getActor logic (if any) might be used, 
     * but currently client relies on this for system-specific fetching.
     */
    getActor?(client: any, actorId: string): Promise<any>;

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

    /**
     * Optional component-specific style overrides.
     * Used by core components like ChatTab and DiceTray to match system aesthetics.
     */
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

export interface ModuleManifest {
    info: {
        id: string; // matches foundry system.id
        title: string;
    };
    adapter: new () => SystemAdapter; // Constructor
    sheet: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
    tools?: Record<string, LazyExoticComponent<ComponentType<any>> | ComponentType<any>>;
}
