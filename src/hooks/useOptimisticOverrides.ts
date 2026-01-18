import { useState, useCallback } from 'react';

type OverrideValue = any; // Can be specific if needed
type OverrideState = Record<string, any>; // itemId -> partial system object

export function useOptimisticOverrides() {
    const [overrides, setOverrides] = useState<OverrideState>({});

    /**
     * Updates the optimistic state for a given item.
     * @param itemId The ID of the item to update
     * @param prop The property key (supports dot notation, e.g., 'system.light.active' or 'light.active' relative to system?)
     *             Current usage implies `prop` is a key in `item.system`. 
     * @param value The new value
     */
    const setOptimistic = useCallback((itemId: string, prop: string, value: OverrideValue) => {
        setOverrides(prev => {
            const currentOverrides = prev[itemId] || { system: {} };
            const nextSystem = JSON.parse(JSON.stringify(currentOverrides.system)); // Deep clone simple object

            // Helper to set nested value
            const parts = prop.split('.');
            let current = nextSystem;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) current[parts[i]] = {};
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = value;

            return {
                ...prev,
                [itemId]: {
                    system: nextSystem
                }
            };
        });
    }, []);

    /**
     * Returns a new list of items with overrides merged in.
     */
    const applyOverrides = useCallback((items: any[]) => {
        return items.map(item => {
            const override = overrides[item.id];
            if (!override) return item;

            // Deep merge system
            // Simple spread isn't enough for deep nesting if only partials are stored.
            // We need a recursive merge if we want to support nested overrides fully without blowing away siblings.
            // But for now, let's use a simple recursion for `system`.

            const mergeDeep = (target: any, source: any) => {
                const output = { ...target };
                if (isObject(target) && isObject(source)) {
                    Object.keys(source).forEach(key => {
                        if (isObject(source[key])) {
                            if (!(key in target)) Object.assign(output, { [key]: source[key] });
                            else output[key] = mergeDeep(target[key], source[key]);
                        } else {
                            Object.assign(output, { [key]: source[key] });
                        }
                    });
                }
                return output;
            };

            return {
                ...item,
                system: mergeDeep(item.system, override.system)
            };
        });
    }, [overrides]);

    return {
        overrides,
        setOptimistic,
        applyOverrides
    };
}

function isObject(item: any) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}
