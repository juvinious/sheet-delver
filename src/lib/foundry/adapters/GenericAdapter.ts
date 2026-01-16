import { SystemAdapter } from './SystemAdapter';
import type { FoundryClient } from '../client';

export class GenericAdapter implements SystemAdapter {
    systemId = 'generic';

    async getActor(client: FoundryClient, actorId: string): Promise<any> {
        return await client.evaluate(async (id) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return null;

            return {
                id: actor.id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                systemId: actor.system?.details?.system || 'generic', // Try to infer or default
                system: actor.system,
                items: actor.items.contents.map((i: any) => ({
                    id: i.id,
                    name: i.name,
                    type: i.type,
                    img: i.img,
                    system: i.system
                })),
                effects: actor.effects.contents.map((e: any) => ({
                    id: e.id,
                    label: e.label || e.name,
                    icon: e.icon,
                    disabled: e.disabled
                })),
                // Raw fallback properties
                // @ts-ignore
                currentUser: window.game.user ? window.game.user.name : 'Unknown'
            };
        }, actorId);
    }

    async getSystemData(client: FoundryClient): Promise<any> {
        // Generic systems typically don't have known compendium structures to map
        return {};
    }
}
