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
                const res = await fetch('/api/system/data', { headers });
                
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

    const value = {
        systemData,
        collections,
        loadingSystem,
        fetchPack
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
