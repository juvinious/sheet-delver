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
    getActor(client: any, actorId: string): Promise<any>;
    getSystemData(client: any): Promise<any>;
}

export interface ModuleManifest {
    info: {
        id: string; // matches foundry system.id
        title: string;
    };
    adapter: new () => SystemAdapter; // Constructor
    sheet: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
}
