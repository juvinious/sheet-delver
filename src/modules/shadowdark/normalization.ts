import { ActorSheetData } from '../core/interfaces';
import { 
    calculateItemSlots, 
    calculateMaxSlots, 
    calculateCoinSlots, 
    calculateGemSlots, 
    isSpellcaster, 
    shouldShowSpellsTab, 
    canUseMagicItems, 
    calculateAC, 
    normalizeActorData as rulesNormalizeActorData, 
    normalizeItemData 
} from './rules';
import { logger } from '../../core/logger';
import { DataManager } from './data/DataManager';
import { CompendiumCache } from '../../core/foundry/compendium-cache';

/**
 * Service to handle Shadowdark-specific actor and item data normalization.
 */
export class ShadowdarkNormalizer {
    /**
     * Resolves human-readable names for character traits (Ancestry, Class, etc.)
     * and stores them in actor.computed.resolvedNames.
     */
    static async resolveActorNames(actor: any, client: any): Promise<void> {
        const s = actor.system || {};
        const cache = CompendiumCache.getInstance();
        actor.computed = actor.computed || {};
        actor.computed.resolvedNames = actor.computed.resolvedNames || {};

        const dataManager = DataManager.getInstance();

        const resolve = async (uuid: any, fallback: string) => {
            if (!uuid) return fallback;
            const name = cache.getName(uuid);
            if (name) return name;
            const doc = await dataManager.getDocument(uuid);
            if (doc) return doc.name;
            return fallback;
        };

        const traits = ['ancestry', 'class', 'background', 'deity', 'patron'];
        for (const trait of traits) {
            const uuid = s[trait];
            if (uuid) {
                // Try resolving via adapter's shared resolveDocument (passed via client or direct import)
                // For now, use local dataManager logic
                const doc = await dataManager.getDocument(uuid);
                if (doc) actor.computed.resolvedNames[trait] = doc.name;
                else actor.computed.resolvedNames[trait] = await resolve(uuid, uuid);
            }
        }

        if (Array.isArray(s.languages)) {
            const resolvedLangs = [];
            for (const uuid of s.languages) {
                const doc = await dataManager.getDocument(uuid);
                if (doc) resolvedLangs.push(doc.name);
                else resolvedLangs.push(await resolve(uuid, uuid));
            }
            if (resolvedLangs.length > 0) {
                actor.computed.resolvedNames.languages = resolvedLangs;
            }
        }
    }

    /**
     * Normalizes a raw actor into a structure suitable for the character sheet.
     */
    static normalizeActorData(actor: any, cachedSystemData: any, baseUrl?: string): ActorSheetData {
        const actorItems = actor.items || [];
        const computed = rulesNormalizeActorData(actor, actorItems);

        // Merge resolved names from resolveActorNames if available
        if (actor.computed?.resolvedNames) {
            computed.resolvedNames = {
                ...(computed.resolvedNames || {}),
                ...actor.computed.resolvedNames
            };
        }

        const abilities = computed.abilities || actor.system?.abilities || {};
        const s = actor.system || {};
        const level = s.level?.value || 1;
        const alignment = (s.alignment || 'neutral').toLowerCase();

        const resolve = (val: any, collection: string) => {
            if (!val) return '';
            if (typeof val !== 'string') return val.name || val.label || '';
            if (!val.includes('.')) return val;

            if (cachedSystemData && (cachedSystemData as any)[collection]) {
                const list = (cachedSystemData as any)[collection];
                const match = list.find((c: any) => 
                    c.uuid === val || c.name === val || (val.endsWith(c.uuid.split('.').pop()))
                );
                if (match) return match.name;
            }
            return val;
        };

        const resolvedItems = actorItems.map((item: any) => {
            if (item.type === 'Spell' && item.system?.class) {
                const cls = item.system.class;
                if (Array.isArray(cls)) {
                    item.system.class = cls.map(c => resolve(c, 'classes')).join(', ');
                } else {
                    item.system.class = resolve(cls, 'classes');
                }
            }
            return item;
        });

        // Effect Merging
        const effects: any[] = [];
        const allFoundryEffects = [...(actor.effects || [])];
        for (const item of actorItems) {
            const itemEffects = item.effects || [];
            for (const e of itemEffects) {
                const eId = e.id || e._id;
                const sourceName = item.name || 'Unknown Item';
                effects.push({ ...e, id: eId, sourceName });
            }
        }

        const sheetData: ActorSheetData = {
            id: actor.id || actor._id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            system: s,
            hp: { value: s.attributes?.hp?.value || 0, max: computed.maxHp || s.attributes?.hp?.max || 0 },
            ac: computed.ac || s.attributes?.ac?.value || 10,
            attributes: abilities,
            stats: abilities,
            items: resolvedItems,
            level: {
                value: level,
                xp: s.level?.xp || 0,
                next: computed.xpNextLevel || 10
            },
            details: {
                alignment: s.alignment || 'Neutral',
                background: computed.resolvedNames?.background || resolve(s.background, 'backgrounds'),
                ancestry: computed.resolvedNames?.ancestry || resolve(s.ancestry, 'ancestries'),
                class: computed.resolvedNames?.class || resolve(s.class, 'classes'),
                patron: computed.resolvedNames?.patron || resolve(s.patron, 'patrons'),
                deity: computed.resolvedNames?.deity || resolve(s.deity, 'deities'),
                languages: computed.resolvedNames?.languages || (Array.isArray(s.languages) ? s.languages.map((l: any) => resolve(l, 'languages')) : []),
                biography: s.details?.biography?.value || '',
                notes: s.details?.notes?.value || '',
                title: (() => {
                    const clsName = computed.resolvedNames?.class || resolve(s.class, 'classes');
                    const titles = cachedSystemData?.titles?.[clsName];
                    if (titles && Array.isArray(titles)) {
                        const match = titles.find((t: any) => level >= t.from && level <= t.to);
                        if (match) return match[alignment] || match.neutral || '';
                    }
                    return s.title || '';
                })()
            },
            luck: s.luck || {},
            coins: s.coins || {},
            effects: effects,
            computed: computed
        } as any;

        return sheetData;
    }
}
