import { SystemAdapter, ActorSheetData } from './types';

export class DnD5eAdapter implements SystemAdapter {
    systemId = 'dnd5e';

    normalizeActorData(actor: any): ActorSheetData {
        const s = actor.system;

        // Safety check for dnd5e structure (which changes often, assuming v2.x/v3.x standard)
        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = s.attributes?.ac?.value || 10;

        // Abilities
        const abilities = s.abilities || {};

        return {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            hp: { value: hp.value, max: hp.max },
            ac: ac,
            attributes: abilities
        };
    }

    getRollData(actor: any, type: string, key: string): { formula: string; type: string; label: string } | null {
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
