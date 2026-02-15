'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useFoundry } from './FoundryContext';
import { logger } from '../logger';

// Walkthrough/Changelog Notes:
// - **Permissions**: "Edit" & "Share" buttons are now hidden for shared content and non-authorized users. Journals are now restricted to users with `Observer` level or higher.
// - **Folder Logic**: Folders are now automatically hidden if they don't contain any journals you have permission to see.
// - **Foundry Style**: Added a prominent "Chapter" header to pages (black bar with white text) matching the core Foundry VTT journal aesthetic.
// - **Creation Fix**: Resolve backend errors when creating new journals or folders by correctly formatting the payload.

export interface JournalEntry {
    _id: string;
    name: string;
    folder: string | null;
    content?: string;
    pages?: any[];
    ownership: Record<string, number>;
}

export interface Folder {
    _id: string;
    name: string;
    type: string;
    folder: string | null;
    sort: number;
    color: string | null;
    ownership?: Record<string, number>;
}

interface JournalContextType {
    journals: JournalEntry[];
    folders: Folder[];
    loading: boolean;
    error: string | null;
    fetchJournals: () => Promise<void>;
    getJournal: (id: string) => Promise<JournalEntry | null>;
    createJournal: (name: string, folderId?: string) => Promise<void>;
    updateJournal: (id: string, data: Partial<JournalEntry>) => Promise<void>;
    deleteJournal: (id: string) => Promise<void>;
    createFolder: (name: string, parentId?: string) => Promise<void>;
}

const JournalContext = createContext<JournalContextType | undefined>(undefined);

export function JournalProvider({ children }: { children: React.ReactNode }) {
    const { token } = useFoundry();
    const [journals, setJournals] = useState<JournalEntry[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchJournals = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/journals', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch journals');
            // Completed Tasks:
            // - [x] Journal Permissions & Creation Fix <!-- id: 102 -->
            // - [x] Restrict Journal visibility to Observer+ (Backend)
            // - [x] Implement Folder visibility logic (containment-based)
            // - [x] Fix Journal creation (array wrap fix)
            // - [x] Fix Folder creation (array wrap fix)
            const data = await res.json();
            setJournals(data.journals || []);
            setFolders(data.folders || []);
        } catch (err: any) {
            logger.error('JournalProvider | Fetch failed:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchJournals();
    }, [token, fetchJournals]);

    const getJournal = useCallback(async (id: string) => {
        if (!token) return null;
        try {
            const res = await fetch(`/api/journals/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch journal detail');
            return await res.json();
        } catch (err) {
            logger.error(`JournalProvider | Get detail failed for ${id}:`, err);
            return null;
        }
    }, [token]);

    const createJournal = async (name: string, folderId?: string) => {
        try {
            const res = await fetch('/api/journals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'JournalEntry',
                    data: { name, folder: folderId || null }
                })
            });
            if (!res.ok) throw new Error('Failed to create journal');
            await fetchJournals();
        } catch (err) {
            logger.error('JournalProvider | Create failed:', err);
        }
    };

    const updateJournal = async (id: string, data: Partial<JournalEntry>) => {
        try {
            const res = await fetch(`/api/journals/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'JournalEntry',
                    data
                })
            });
            if (!res.ok) throw new Error('Failed to update journal');
            await fetchJournals();
        } catch (err) {
            logger.error(`JournalProvider | Update failed for ${id}:`, err);
        }
    };

    const deleteJournal = async (id: string) => {
        try {
            const res = await fetch(`/api/journals/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete journal');
            await fetchJournals();
        } catch (err) {
            logger.error(`JournalProvider | Delete failed for ${id}:`, err);
        }
    };

    const createFolder = async (name: string, parentId?: string) => {
        try {
            const res = await fetch('/api/journals', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'Folder',
                    data: {
                        name,
                        type: 'JournalEntry',
                        folder: parentId || null
                    }
                })
            });
            if (!res.ok) throw new Error('Failed to create folder');
            await fetchJournals();
        } catch (err) {
            logger.error('JournalProvider | Create folder failed:', err);
        }
    };

    return (
        <JournalContext.Provider value={{
            journals, folders, loading, error,
            fetchJournals, getJournal, createJournal, updateJournal, deleteJournal, createFolder
        }}>
            {children}
        </JournalContext.Provider>
    );
}

export const useJournals = () => {
    const context = useContext(JournalContext);
    if (!context) throw new Error('useJournals must be used within a JournalProvider');
    return context;
};
