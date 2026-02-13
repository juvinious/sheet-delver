
export const resolveGear = async (classOrPatronObj: any, fetchDocument: (uuid: string) => Promise<any>) => {
    if (!classOrPatronObj) return [];

    const candidates = new Set<string>();

    // 1. Scan properties that are likely to be lists of UUIDs
    // We scan the root object and the 'system' object
    const objectsToScan = [classOrPatronObj, classOrPatronObj.system || {}];

    for (const obj of objectsToScan) {
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0) {
                // Check if it's a string array (UUIDs)
                if (typeof val[0] === 'string') {
                    // Filter out system-like keys or non-uuids if possible, but mostly we want everything
                    // Common Shadowdark keys: equipment, items, talents, spells, languages, traits, invocations
                    val.forEach(v => {
                        // Basic UUID check or just trusting the data
                        if (v.includes('.')) candidates.add(v);
                    });
                }
            }
        }
    }

    // Sometimes it's a list of UUIDs, sometimes objects (mix)
    const resolvedItems = [];

    for (const entry of candidates) {
        const item = await fetchDocument(entry);
        if (item) {
            const clean = item.toObject ? item.toObject() : { ...item };
            delete clean._id;
            resolvedItems.push(clean);
        }
    }

    // Also handle manual object arrays if they exist (old behavior fallback)
    // primarily in 'equipment' or 'items'
    const manualLists = ['equipment', 'items'];
    for (const key of manualLists) {
        const list = classOrPatronObj.system?.[key];
        if (Array.isArray(list)) {
            for (const entry of list) {
                if (typeof entry === 'object' && entry.name && entry.type) {
                    resolvedItems.push(entry);
                }
            }
        }
    }

    return resolvedItems;
};
