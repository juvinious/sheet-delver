
export const resolveGear = async (classOrPatronObj: any, fetchDocument: (uuid: string) => Promise<any>) => {
    if (!classOrPatronObj) return [];

    // Baggage is usually defined in system.equipment or system.items
    // Adjust based on Shadowdark data structure
    const gearList = classOrPatronObj.system?.equipment || classOrPatronObj.system?.items || [];

    // Sometimes it's a list of UUIDs, sometimes objects
    const resolvedItems = [];

    for (const entry of gearList) {
        if (typeof entry === 'string') {
            // UUID likely
            const item = await fetchDocument(entry);
            if (item) resolvedItems.push(item);
        } else if (entry.uuid) {
            const item = await fetchDocument(entry.uuid);
            if (item) resolvedItems.push(item);
        } else {
            // Manual entry
            // Check if it's a valid Item structure
            if (entry.name && entry.type) {
                resolvedItems.push(entry);
            }
        }
    }

    return resolvedItems;
};
