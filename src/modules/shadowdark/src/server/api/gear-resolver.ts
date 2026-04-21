import { logger } from '@shared/utils/logger';
import { shadowdarkAdapter } from '../../server/ShadowdarkAdapter';
import { sanitizeItem } from '../../utils/Sanitizer';

function getUuidRef(ref: unknown): string | null {
    if (typeof ref === 'string') return ref;
    if (!ref || typeof ref !== 'object') return null;

    const uuid = Reflect.get(ref as object, 'uuid');
    return typeof uuid === 'string' ? uuid : null;
}

/**
 * Resolves all associated documents (talents, features, gear) for a class or ancestry.
 */
export async function resolveBaggage(doc: any, client?: any): Promise<any[]> {
    if (!doc || !doc.system) return [];

    const baggage: any[] = [];
    const talentChoiceCount = doc.system.talentChoiceCount || 0;
    const rawTalents = doc.system.talents || [];

    // Only include talents if they are FIXED (not choices)
    const fixedTalents = (talentChoiceCount === 0 || rawTalents.length <= talentChoiceCount)
        ? rawTalents
        : [];

    const refs: string[] = [
        ...fixedTalents,
        ...(doc.system.features || []),
        ...(doc.system.abilities || []),
        ...(doc.system.classAbilities || []),
        ...(doc.system.startingSpells || [])
        // talentChoices excluded - these are handled by the Generator UI
    ];

    for (const ref of refs) {
        const uuid = getUuidRef(ref);
        if (uuid) {
            try {
                const item = await shadowdarkAdapter.resolveDocument(client, uuid);
                if (item) {
                    // DEEP CLONE: Prevent cache poisoning by ensuring each resolved item is a fresh instance
                    const clean = JSON.parse(JSON.stringify(sanitizeItem(item)));
                    delete clean._id;

                    // ATTACH UUID: Essential for duplication checks in the Generator
                    clean.uuid = uuid;

                    baggage.push(clean);
                }
            } catch (e) {
                logger.error(`[GearResolver] Failed to resolve baggage ${uuid}:`, e);
            }
        }
    }

    return baggage;
}

/**
 * Legacy-style gear resolver that scans a document for any arrays of UUID strings.
 */
export async function resolveGear(doc: any, client?: any): Promise<any[]> {
    if (!doc) return [];

    const candidates = new Set<string>();
    const objectsToScan = [doc, doc.system || {}];

    for (const obj of objectsToScan) {
        for (const key of Object.keys(obj)) {
            if (['talents', 'features', 'abilities', 'classAbilities'].includes(key)) {
                continue;
            }

            const val = obj[key];
            if (Array.isArray(val) && val.length > 0) {
                if (typeof val[0] === 'string') {
                    val.forEach(v => {
                        // Only add if it looks like a Gear UUID
                        if (typeof v === 'string' && v.includes('.') && v.includes('.gear.')) {
                            candidates.add(v);
                        }
                    });
                }
            }
        }
    }

    const resolvedItems = [];
    for (const entry of candidates) {
        try {
            const item = await shadowdarkAdapter.resolveDocument(client, entry);
            if (item) {
                // DEEP CLONE: Prevent cache poisoning
                const clean = JSON.parse(JSON.stringify(sanitizeItem(item)));
                delete clean._id;

                // ATTACH UUID: Essential for duplication checks
                clean.uuid = entry;

                resolvedItems.push(clean);
            }
        } catch (e) {
            logger.error(`[GearResolver] Failed to resolve gear ${entry}:`, e);
        }
    }

    // Handle manual object arrays in 'equipment' or 'items'
    const manualLists = ['equipment', 'items'];
    for (const key of manualLists) {
        const list = doc.system?.[key];
        if (Array.isArray(list)) {
            for (const entry of list) {
                if (typeof entry === 'object' && entry.name && entry.type) {
                    resolvedItems.push(JSON.parse(JSON.stringify(sanitizeItem(entry))));
                }
            }
        }
    }

    return resolvedItems;
}
