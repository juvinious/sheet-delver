import { useState, useCallback } from 'react';

type OverrideValue = any; // Can be specific if needed
type OverrideState = Record<string, any>; // itemId -> partial system object

export function useOptimisticOverrides() {
    const [overrides, setOverrides] = useState<OverrideState>({});

    /**
     * Updates the optimistic state for a given item.
     * @param itemId The ID of the item to update
     * @param prop The property key in `system` (e.g., 'equipped', 'quantity', 'light.active')
     * @param value The new value
     */
    const setOptimistic = useCallback((itemId: string, prop: string, value: OverrideValue) => {
        setOverrides(prev => {
            const currentItemOverrides = prev[itemId] || { system: {} };

            let nextSystem = { ...currentItemOverrides.system };

            if (prop === 'light.active') {
                nextSystem.light = {
                    ...(nextSystem.light || {}),
                    active: value
                };
            } else {
                // Top level system prop
                nextSystem[prop] = value;
            }

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

            return {
                ...item,
                system: {
                    ...item.system,
                    ...override.system,
                    // handle nested light merge if present
                    light: {
                        ...item.system?.light,
                        ...(override.system?.light || {})
                    }
                }
            };
        });
    }, [overrides]);

    return {
        overrides,
        setOptimistic,
        applyOverrides
    };
}
