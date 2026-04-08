'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UIContextType {
    isChatOpen: boolean;
    setChatOpen: (open: boolean) => void;
    isDiceTrayOpen: boolean;
    setDiceTrayOpen: (open: boolean) => void;
    toggleDiceTray: () => void;
    isJournalOpen: boolean;
    setJournalOpen: (open: boolean) => void;
    toggleJournal: () => void;
    isPlayerListOpen: boolean;
    setPlayerListOpen: (open: boolean) => void;
    togglePlayerList: () => void;
    activeJournalId: string | null;
    setActiveJournalId: (id: string | null) => void;
    sharedJournalId: string | null;
    setSharedJournalId: (id: string | null) => void;
    resetUI: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
    const [isChatOpen, setChatOpen] = useState(false);
    const [isDiceTrayOpen, setDiceTrayOpen] = useState(false);
    const [isJournalOpen, setJournalOpen] = useState(false);
    const [isPlayerListOpen, setPlayerListOpen] = useState(false);
    const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
    const [sharedJournalId, setSharedJournalId] = useState<string | null>(null);

    const toggleDiceTray = () => setDiceTrayOpen(prev => !prev);
    const toggleJournal = () => setJournalOpen(prev => !prev);
    const togglePlayerList = () => setPlayerListOpen(prev => !prev);

    const resetUI = () => {
        setChatOpen(false);
        setDiceTrayOpen(false);
        setJournalOpen(false);
        setPlayerListOpen(false);
        setActiveJournalId(null);
        setSharedJournalId(null);
    };

    const contextValue = React.useMemo(() => ({
        isChatOpen, setChatOpen,
        isDiceTrayOpen, setDiceTrayOpen, toggleDiceTray,
        isJournalOpen, setJournalOpen, toggleJournal,
        isPlayerListOpen, setPlayerListOpen, togglePlayerList,
        activeJournalId, setActiveJournalId,
        sharedJournalId, setSharedJournalId,
        resetUI
    }), [
        isChatOpen, isDiceTrayOpen, isJournalOpen, isPlayerListOpen,
        activeJournalId, sharedJournalId
    ]);

    return (
        <UIContext.Provider value={contextValue}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}
