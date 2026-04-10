import { ActorSheetData } from '@shared/interfaces';
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
import { logger } from '@shared/utils/logger';

/**
 * Standalone utility to resolve a document name from a UUID or ID using the system data.
 */
export function resolveDocumentName(val: any, cachedSystemData: any): string {
    if (!val) return '';
    if (typeof val !== 'string') return val.name || val.label || '';

    // Normalization: Ensure we check for names/IDs even if no dot is present 
    // (Foundry IDs are often raw alphanumeric strings).

    if (cachedSystemData) {
        // High-performance Name Index lookup (preferred)
        const nameIndex = cachedSystemData.nameIndex || {};
        if (nameIndex[val]) return nameIndex[val];

        // Legacy/Fallback collections lookup
        const collections = [
            'ancestries', 'classes', 'backgrounds', 'deities', 'patrons', 
            'languages', 'spells', 'talents', 'gear', 'magicItems', 
            'conditions', 'spellEffects', 'properties', 'documentation', 'macros'
        ];
        for (const key of collections) {
            const list = (cachedSystemData as any)[key];
            if (!list) continue;
            const match = list.find((c: any) =>
                c.uuid === val || c._id === val || c.id === val || (typeof val === 'string' && val.endsWith(c._id || c.id))
            );
            if (match) return match.name;
        }
    }

    // Only split by dots if it looks like a Compendium UUID
    if (val.startsWith('Compendium.')) {
        return val.split('.').pop()?.replace(/^[a-z]/, (c: string) => c.toUpperCase()) || val;
    }

    return val;
}

/**
 * Common sanitization for item descriptions (UUID links, inline rolls).
 */
export const formatDescription = (desc: any, theme?: any) => {
    if (!desc || typeof desc !== 'string') return '';

    let fixed = desc;

    // 1. @UUID Links: @UUID[...]{Label} -> Label
    fixed = fixed.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');

    // 2. Inline Rolls: [[/r 1d8]] or [[/roll 1d8]]
    fixed = fixed.replace(/\[\[(.*?)\]\]/g, (match, content) => {
        const cleanContent = content.replace(/<[^>]*>?/gm, '').replace(/&amp;/g, '&').replace(/<[^>]*>/g, '');
        const lower = cleanContent.toLowerCase().trim();

        const rollClasses = theme?.inlineRolls || "inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer";

        const checkMatch = lower.match(/^check\s+(\d+)\s+(\w+)$/);
        if (checkMatch) {
            return `<button data-action="roll-check" data-dc="${checkMatch[1]}" data-stat="${checkMatch[2]}" class="${rollClasses}">check ${checkMatch[2].toUpperCase()} (DC ${checkMatch[1]})</button>`;
        }

        if (lower.startsWith('/r') || lower.startsWith('/roll')) {
            const formula = cleanContent.replace(/^\/(r|roll)\s*/i, '').trim();
            return `<button type="button" data-action="roll-formula" data-formula="${formula}" class="${rollClasses}"><span class="font-serif italic">roll</span> ${formula}</button>`;
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
        const level = s.level?.value ?? 0;
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
            // Note: baseUrl/theme are passed via options object in future refactor, 
            // but for now we look up from global if needed or pass directly.
            if (item.system?.description) {
                // To keep this pure, the caller (Adapter) should ideally provide the theme.
                // We'll add it as an optional arg to normalizeActorData.
                item.system.description = formatDescription(item.system.description, (actor as any)._theme);
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
                    // 1. Level 0 Check - Characters advance from 0 to 1 manually and have no titles
                    const levelVal = Number(s.level?.value) || 0;
                    if (levelVal === 0) return "";

                    // 2. Resolve Alignment
                    const alignment = (s.alignment || '').toLowerCase();
                    if (alignment === "") return "";

                    // 3. Try to get titles from embedded class item first
                    const clsItem = computed.classDetails;
                    let titles = clsItem?.system?.titles;
                    let clsName = clsItem?.name || "";

                    // 4. Fallback: Resolve titles from cachedSystemData via system-level class reference
                    if (!titles || !Array.isArray(titles) || titles.length === 0) {
                        clsName = computed.resolvedNames?.class || resolveDocumentName(s.class, cachedSystemData);
                        titles = cachedSystemData?.titles?.[clsName];
                    }

                    // 5. Deep Search Fallback: If map lookup failed, search the classes array directly
                    if (!titles || !Array.isArray(titles) || titles.length === 0) {
                        const classDoc = (cachedSystemData?.classes || []).find((c: any) =>
                            c.name?.toLowerCase() === clsName.toLowerCase() ||
                            c.uuid === s.class
                        );
                        if (classDoc?.system?.titles) {
                            titles = classDoc.system.titles;
                        }
                    }

                    // 6. Match Level Range
                    let result = "";
                    if (titles && Array.isArray(titles)) {
                        const match = titles.find((t: any) => levelVal >= t.from && levelVal <= t.to);
                        if (match) {
                            result = match[alignment] || "";
                            if (result) {
                                logger.debug(`[Shadowdark] Title matched for level ${levelVal}/${alignment}: ${result}`);
                            }
                        }
                    }


                    
                    return result;
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

