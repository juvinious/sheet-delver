import { useState, useEffect, useMemo } from 'react';
import { logger } from '@shared/utils/logger';

const getErrorMessage = (error: unknown, fallback = 'Failed to fetch custom maps'): string => {
    if (error instanceof Error) return error.message;
    return typeof error === 'string' ? error : fallback;
};

interface CustomMaps {
    PREDEFINED_EFFECTS: Record<string, any>;
    BOON_TYPES: Record<string, string>;
    EFFECT_TRANSLATIONS: Record<string, string>;
    generatedAt?: string;
}

/**
 * Hook to fetch and manage Shadowdark static rule mappings and predefined effects.
 * This independently retrieves metadata from the dedicated endpoint to keep 
 * the UI decoupled from the primary systemData payload.
 */
export function useShadowdarkCustomMaps() {
    const [maps, setMaps] = useState<CustomMaps | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function fetchMaps() {
            try {
                const res = await fetch('/api/modules/shadowdark/custom-maps');
                if (!res.ok) throw new Error(`Failed to fetch custom maps: ${res.statusText}`);
                
                const data = await res.json();
                if (isMounted) {
                    setMaps(data);
                    setLoading(false);
                }
            } catch (error: unknown) {
                logger.error('[useShadowdarkCustomMaps] Fetch failed:', error);
                if (isMounted) {
                    setError(getErrorMessage(error));
                    setLoading(false);
                }
            }
        }

        fetchMaps();

        return () => {
            isMounted = false;
        };
    }, []);

    const value = useMemo(() => ({
        maps,
        loading,
        error,
        predefinedEffects: maps?.PREDEFINED_EFFECTS || {},
        boonTypes: maps?.BOON_TYPES || {},
        effectTranslations: maps?.EFFECT_TRANSLATIONS || {}
    }), [maps, loading, error]);

    return value;
}
