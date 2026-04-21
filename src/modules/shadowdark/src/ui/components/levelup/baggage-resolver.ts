import { logger } from '@shared/utils/logger';

function getUuidRef(ref: unknown): string | null {
    if (typeof ref === 'string') return ref;
    if (!ref || typeof ref !== 'object') return null;

    const uuid = Reflect.get(ref as object, 'uuid');
    return typeof uuid === 'string' ? uuid : null;
}

export const resolveBaggage = async (doc: any, fetchDocument: (uuid: string) => Promise<any>): Promise<any[]> => {
    if (!doc || !doc.system) return [];

    const baggage: any[] = [];

    const refs: string[] = [
        ...(doc.system.talents || []),
        ...(doc.system.features || []),
        ...(doc.system.abilities || []),
        ...(doc.system.classAbilities || []),
        ...(doc.system.startingSpells || []),
        ...(doc.system.talentChoices || []) // Only if fixed choices are implied? Usually classTalents are lists.
    ];

    // Some classes use 'classAbilities' instead of 'abilities'
    // Source data check: Priest uses 'talents' and 'startingSpells'. Wizard uses 'talents'. 
    // Fighter uses 'talents' and 'talentChoices'.

    for (const ref of refs) {
        const uuid = getUuidRef(ref);
        if (uuid) {
            try {
                const item = await fetchDocument(uuid);
                if (item) {
                    // Tag it if needed or sanitize
                    const sanitized = { ...item };
                    delete sanitized._id; // We want to create NEW embedded items
                    baggage.push(sanitized);
                }
            } catch (e) {
                logger.error(`BaggageResolver: Failed to fetch ${uuid}`, e);
            }
        }
    }

    return baggage;
};
