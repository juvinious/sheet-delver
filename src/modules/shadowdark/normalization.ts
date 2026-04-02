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
import { CompendiumCache } from '../../core/foundry/compendium-cache';

/**
 * Standalone utility to resolve a document name from a UUID or ID using the system data.
 */
export function resolveDocumentName(val: any, cachedSystemData: any): string {
    if (!val) return '';
    if (typeof val !== 'string') return val.name || val.label || '';
    
    // Normalization: Ensure we check for names/IDs even if no dot is present 
    // (Foundry IDs are often raw alphanumeric strings).

    if (cachedSystemData) {
        const collections = ['ancestries', 'classes', 'backgrounds', 'deities', 'patrons', 'languages', 'spells', 'talents'];
        for (const key of collections) {
            const list = (cachedSystemData as any)[key];
            if (!list) continue;
            const match = list.find((c: any) => 
                c.uuid === val || c._id === val || c.id === val || (val.endsWith(c._id || c.id))
            );
            if (match) return match.name;
        }
    }
    
    // Last resort fallback: Compendium cache or humanized UUID segment
    const cache = CompendiumCache.getInstance();
    const cachedName = cache.getName(val);
    if (cachedName) return cachedName;

    return val.split('.').pop()?.replace(/^[a-z]/, (c: string) => c.toUpperCase()) || val;
}

/**
 * Common sanitization for item descriptions (UUID links, inline rolls).
 */
export const formatDescription = (desc: any) => {
    if (!desc || typeof desc !== 'string') return '';

    let fixed = desc;

    // 1. @UUID Links: @UUID[...]{Label} -> Label
    fixed = fixed.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');

    // 2. Inline Rolls: [[/r 1d8]] or [[/roll 1d8]]
    fixed = fixed.replace(/\[\[(.*?)\]\]/g, (match, content) => {
        const cleanContent = content.replace(/<[^>]*>?/gm, '').replace(/&amp;/g, '&').replace(/<[^>]*>/g, '');
        const lower = cleanContent.toLowerCase().trim();

        const checkMatch = lower.match(/^check\s+(\d+)\s+(\w+)$/);
        if (checkMatch) {
            return `<button data-action="roll-check" data-dc="${checkMatch[1]}" data-stat="${checkMatch[2]}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer">check ${checkMatch[2].toUpperCase()} (DC ${checkMatch[1]})</button>`;
        }

        if (lower.startsWith('/r') || lower.startsWith('/roll')) {
            const formula = cleanContent.replace(/^\/(r|roll)\s*/i, '').trim();
            return `<button type="button" data-action="roll-formula" data-formula="${formula}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer"><span class="font-serif italic">roll</span> ${formula}</button>`;
        }

        return match;
    });

    return fixed;
};

/**
 * Service to handle Shadowdark-specific actor and item data normalization.
 */
export class ShadowdarkNormalizer {
    /**
     * Resolves human-readable names for character traits (Ancestry, Class, etc.)
     * and stores them in actor.computed.resolvedNames.
     */
    static async resolveActorNames(actor: any, cachedSystemData: any): Promise<void> {
        const s = actor.system || {};
        actor.computed = actor.computed || {};
        actor.computed.resolvedNames = actor.computed.resolvedNames || {};

        const traits = ['ancestry', 'class', 'background', 'deity', 'patron'];
        for (const trait of traits) {
            const val = s[trait];
            if (val) {
                actor.computed.resolvedNames[trait] = resolveDocumentName(val, cachedSystemData);
            }
        }

        if (Array.isArray(s.languages)) {
            const resolvedLangs = s.languages.map((l: any) => resolveDocumentName(l, cachedSystemData));
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
        const computed = rulesNormalizeActorData(actor, actorItems, cachedSystemData);

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

        const resolvedItems = actorItems.map((item: any) => {
            if (item.type === 'Spell' && item.system?.class) {
                const cls = item.system.class;
                if (Array.isArray(cls)) {
                    item.system.class = cls.map((c: any) => resolveDocumentName(c, cachedSystemData)).join(', ');
                } else {
                    item.system.class = resolveDocumentName(cls, cachedSystemData);
                }
            }

            // Centralized Sanitization
            if (item.system?.description) {
                item.system.description = formatDescription(item.system.description);
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
                background: computed.resolvedNames?.background || resolveDocumentName(s.background, cachedSystemData),
                ancestry: computed.resolvedNames?.ancestry || resolveDocumentName(s.ancestry, cachedSystemData),
                class: computed.resolvedNames?.class || resolveDocumentName(s.class, cachedSystemData),
                patron: computed.resolvedNames?.patron || resolveDocumentName(s.patron, cachedSystemData),
                deity: computed.resolvedNames?.deity || resolveDocumentName(s.deity, cachedSystemData),
                languages: computed.resolvedNames?.languages || (Array.isArray(s.languages) ? s.languages.map((l: any) => resolveDocumentName(l, cachedSystemData)) : []),
                biography: s.details?.biography?.value || '',
                notes: s.details?.notes?.value || '',
                title: (() => {
                    const clsName = computed.resolvedNames?.class || resolveDocumentName(s.class, cachedSystemData);
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
            computed: computed,
            derived: computed
        } as any;

        return sheetData;
    }
}

