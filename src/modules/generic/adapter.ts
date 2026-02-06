import { SystemAdapter, ActorSheetData } from '../core/interfaces';

export class GenericSystemAdapter implements SystemAdapter {
    systemId = 'generic';

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    match(actor: any): boolean {
        return false; // Generic never matches specifically, it is the fallback
    }

    async getActor(client: any, actorId: string): Promise<any> {
        return await client.evaluate((id: string) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return null;
            return {
                id: actor.id || actor._id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                system: actor.system,
                items: actor.items.contents.map((i: any) => ({
                    id: i.id,
                    name: i.name,
                    type: i.type,
                    img: i.img,
                    system: i.system
                })),
                effects: [],
                computed: {}
            };
        }, actorId);
    }

    async getSystemData(): Promise<any> {
        return {};
    }

    getRollData(): any {
        return null;
    }

    normalizeActorData(actor: any): ActorSheetData {
        // Basic fallback that tries to guess common fields or dumps raw system data
        return {
            id: actor.id || actor._id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            attributes: actor.system
        };
    }
}


