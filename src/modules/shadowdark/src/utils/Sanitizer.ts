import { logger } from '@shared/utils/logger';

/**
 * Common sanitization for Shadowdark items to ensure they are compatible
 * with the UI and don't cause Foundry errors during import/update.
 */
export function sanitizeItem(item: any): any {
    if (!item) return item;
    
    const clean = { ...item };

    // Standardize internal types to 'Talent' for consistent UI categorization if required 
    // (Existing logic: keeps it for now for compatibility with non-Foundry source data)
    if (clean.type === 'text' || clean.type === 0 || clean.type === 'PatronBoon' || clean.type === 'PatronBoonTwice' || clean.type === 'synthetic') {
        clean.type = 'Talent';
    }

    // Trust the hydrated cache data. Do not strip system fields.
    return clean;
}

/**
 * Helper to construct a standardized Shadowdark Effect object.
 */
export function createEffect(name: string, icon: string, changes: any[], options: any = {}): any {
    return {
        _id: options._id || Math.random().toString(36).substring(2, 15),
        name: name,
        icon: icon || "icons/svg/aura.svg",
        img: icon || "icons/svg/aura.svg", // Compatibility
        changes: changes.map(c => ({
            key: c.key,
            mode: c.mode ?? 2, // ADD
            value: String(c.value),
            priority: c.priority ?? 0
        })),
        disabled: !!options.disabled,
        duration: options.duration || { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
        origin: options.origin || null,
        transfer: options.transfer !== false,
        flags: {
            shadowdark: {
                sourceName: options.sourceName || "System",
                ...options.flags
            },
            ...options.rootFlags
        },
        statuses: options.statuses || []
    };
}

export function sanitizeItems(items: any[]): any[] {
    if (!Array.isArray(items)) return [];
    return items.map(sanitizeItem);
}
