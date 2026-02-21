import { SystemAdapter, ActorSheetData } from '../core/interfaces';

export class DnD5eAdapter implements SystemAdapter {
    systemId = 'dnd5e';

    match(actor: any): boolean {
        return actor.systemId === 'dnd5e';
    }

    async getActor(client: any, actorId: string): Promise<any> {
        // Basic implementation for now
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

    async getSystemData(): Promise<any> { return {}; }

    normalizeActorData(actor: any): ActorSheetData {
        const s = actor.system;

        // Safety check for dnd5e structure (which changes often, assuming v2.x/v3.x standard)
        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = s.attributes?.ac?.value || 10;

        // Abilities
        const abilities = s.abilities || {};

        return {
            id: actor.id || actor._id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            hp: { value: hp.value, max: hp.max },
            ac: ac,
            system: s
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getRollData(actor: any, type: string, key: string, _options: any = {}): { formula: string; type: string; label: string } | null {
        if (type === 'ability') {
            const abilities = actor.system.abilities;
            if (abilities && abilities[key]) {
                const mod = abilities[key].mod;
                const sign = mod >= 0 ? '+' : '';
                return {
                    formula: `1d20 ${sign} ${mod}`,
                    type: 'ability',
                    label: `${key.toUpperCase()} Check`
                };
            }
        }
        return null;
    }
}
