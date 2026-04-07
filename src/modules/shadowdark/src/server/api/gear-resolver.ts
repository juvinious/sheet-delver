import { logger } from '@/core/logger';
import { shadowdarkAdapter } from '../../logic/system';
import { sanitizeItem } from '../../utils/Sanitizer';

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
        ...(doc.system.startingSpells || []),
        ...(doc.system.talentChoices || [])
    ];

    for (const ref of refs) {
        const uuid = (typeof ref === 'string') ? ref : (ref as any).uuid;
        if (uuid) {
            try {
                const item = await shadowdarkAdapter.resolveDocument(client, uuid);
                if (item) {
                    const clean = sanitizeItem(item);
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
                const clean = sanitizeItem(item);
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
                    resolvedItems.push(sanitizeItem(entry));
                }
            }
        }
    }

    return resolvedItems;
}
