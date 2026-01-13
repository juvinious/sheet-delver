import { SystemAdapter, ActorSheetData } from './types';

export class GenericSystemAdapter implements SystemAdapter {
    systemId = 'generic';

    normalizeActorData(actor: any): ActorSheetData {
        // Basic fallback that tries to guess common fields or dumps raw system data
        return {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            attributes: actor.system
        };
    }

    getRollData(actor: any, type: string, key: string): { formula: string; type: string; label: string } | null {
        return null;
    }
}
