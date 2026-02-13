
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
        const uuid = (typeof ref === 'string') ? ref : (ref as any).uuid;
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
                console.error(`BaggageResolver: Failed to fetch ${uuid}`, e);
            }
        }
    }

    return baggage;
};
