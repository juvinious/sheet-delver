'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { logger } from '@shared/utils/logger';

/**
 * ARCHITECTURAL SAFEGUARD:
 * 
 * This context separates the "Lean Index" (systemData) from "Heavy Rule Shards" (collections).
 * 
 * - systemData: Is the immutable manifest containing metadata and the nameIndex.
 * - collections: Is an ephemeral, on-demand cache for full rule shards (spells, gear, etc.).
 * 
 * DO NOT MERGE these objects. The separation is intentional to prevent "God Object" bloat
 * and ensure the character sheet remains performant.
 */

interface ShadowdarkUIState {
    systemData: any | null;
    collections: Record<string, any[]>;
    loadingSystem: boolean;
    fetchPack: (packId: string) => Promise<any>;
    resolveName: (value: string, collection?: string) => string;
    resolveUuid: (nameOrValue: string, collection: string) => string;
}

const ShadowdarkUIContext = createContext<ShadowdarkUIState | undefined>(undefined);

export function ShadowdarkUIProvider({ 
    children, 
    token 
}: { 
    children: React.ReactNode; 
    token?: string | null;
}) {
    const [systemData, setSystemData] = useState<any>(null);
    const [collections, setCollections] = useState<Record<string, any[]>>({});
    const [loadingSystem, setLoadingSystem] = useState(true);

    // Orchestrates on-demand fetching of rule shards
    const fetchPack = useCallback(async (packId: string) => {
        // Return from cache if already loaded
        if (collections[packId]) return collections[packId];

        try {
            const headers: any = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // We use the standard fetch-pack endpoint
            const res = await fetch(`/api/modules/shadowdark/fetch-pack/${packId}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();

            // ARCHITECTURAL BOUNDARY: Update the collections cache, 
            // NOT the systemData manifest.
            setCollections(prev => {
                // Double check if it's already there to avoid unnecessary re-renders
                if (prev[packId]) return prev;
                return {
                    ...prev,
                    [packId]: data
                };
            });

            return data;
        } catch (err) {
            logger.error(`[ShadowdarkUIContext] Failed to fetch pack ${packId}:`, err);
            return null;
        }
    }, [collections, token]);

    // Initial fetch of the Lean Index manifest
    useEffect(() => {
        setLoadingSystem(true);
        const headers: any = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const fetchData = async (retries = 3, delay = 1000) => {
            try {
                const res = await fetch('/api/modules/shadowdark/index', { headers });
                
                // Handle system initialization state
                if (res.status === 503 && retries > 0) {
                    logger.warn(`[ShadowdarkUIContext] System initializing (503), retrying in ${delay / 1000}s...`);
                    setTimeout(() => fetchData(retries - 1, delay * 2), delay);
                    return;
                }

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const data = await res.json();
                
                // Ensure data structure is clean
                setSystemData(data || {});
                setLoadingSystem(false);
            } catch (err) {
                logger.error('[ShadowdarkUIContext] Failed to fetch system manifest:', err);
                if (retries > 0) {
                    setTimeout(() => fetchData(retries - 1, delay * 2), delay);
                } else {
                    setSystemData({});
                    setLoadingSystem(false);
                }
            }
        };

        fetchData();
    }, [token]);

    // Helper to resolve a name from a UUID or ID across Lean Index and Shards
    const resolveName = useCallback((value: string, collection?: string): string => {
        if (!value) return '';

        // 1. Check systemData (Lean Index) - Use Name Index
        if (systemData?.nameIndex?.[value]) {
            return systemData.nameIndex[value];
        }

        // 2. Check collections (Hydrated Shards)
        if (collection && collections[collection]) {
            const found = collections[collection].find((i: any) => i.id === value || i.uuid === value || i._id === value || i.name === value);
            if (found) return found.name;
        }

        return value; // Fallback to raw value
    }, [systemData, collections]);

    // Helper to resolve a UUID from a name or ID
    const resolveUuid = useCallback((nameOrValue: string, collection: string): string => {
        if (!nameOrValue || !collection) return '';

        // If it already looks like a UUID, return it
        if (nameOrValue.includes('.') && nameOrValue.length > 20) return nameOrValue;

        // 1. Check Lean Index - We can't reverse search nameIndex easily, 
        // but often 'value' IS the ID/UUID.
        if (systemData?.nameIndex?.[nameOrValue]) return nameOrValue;

        // 2. Check Hydrated Shards
        if (collections[collection]) {
            const found = collections[collection].find((i: any) => i.name === nameOrValue || i.id === nameOrValue || i._id === nameOrValue || i.uuid === nameOrValue);
            if (found) return found.uuid || found._id || found.id || found.name;
        }

        return nameOrValue;
    }, [systemData, collections]);

    const value = {
        systemData,
        collections,
        loadingSystem,
        fetchPack,
        resolveName,
        resolveUuid
    };

    return (
        <ShadowdarkUIContext.Provider value={value}>
            {children}
        </ShadowdarkUIContext.Provider>
    );
}

export function useShadowdarkUI() {
    const context = useContext(ShadowdarkUIContext);
    if (context === undefined) {
        throw new Error('useShadowdarkUI must be used within a ShadowdarkUIProvider');
    }
    return context;
}
