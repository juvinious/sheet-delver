'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { logger, LOG_LEVEL } from '../logger';
import { SystemInfo } from '@/shared/interfaces';
import { useNotifications } from '../components/NotificationSystem';
import { SystemAdapter } from '@/modules/core/interfaces';

export interface User {
    id?: string;
    _id?: string;
    name: string;
    active?: boolean;
    isGM?: boolean;
    role?: number;
    color?: string;
    characterName?: string;
}

export type ConnectionStep = 'init' | 'reconnecting' | 'login' | 'dashboard' | 'setup' | 'startup' | 'authenticating' | 'initializing';

interface FoundryContextType {
    step: ConnectionStep;
    setStep: (step: ConnectionStep) => void;
    token: string | null;
    setToken: (token: string | null) => void;
    users: User[];
    currentUser: User | null;
    system: SystemInfo | null;
    messages: any[];
    appVersion: string | null;
    activeAdapter: SystemAdapter | null;
    setActiveAdapter: (adapter: SystemAdapter | null) => void;

    // Actions
    handleLogin: (username: string, password?: string) => Promise<void>;
    handleChatSend: (message: string, options?: { rollMode?: string, speaker?: string }) => Promise<void>;
    handleLogout: () => Promise<void>;
    fetchActors: () => Promise<any>;

    // Actors (Shared state)
    ownedActors: any[];
    readOnlyActors: any[];
    sharedContent: any | null;
}

const FoundryContext = createContext<FoundryContextType | undefined>(undefined);

export function FoundryProvider({ children }: { children: ReactNode }) {
    const { addNotification } = useNotifications();
    const [step, setStepState] = useState<ConnectionStep>('init');
    const [token, setTokenState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sheet-delver-token');
        }
        return null;
    });

    const [users, setUsers] = useState<User[]>([]);
    const [system, setSystem] = useState<SystemInfo | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [appVersion, setAppVersion] = useState<string | null>(null);
    const [lastActorSyncToken, setLastActorSyncToken] = useState<number>(0);
    const [activeAdapter, setActiveAdapter] = useState<SystemAdapter | null>(null);
    const [ownedActors, setOwnedActors] = useState<any[]>([]);
    const [readOnlyActors, setReadOnlyActors] = useState<any[]>([]);
    const [sharedContent, setSharedContent] = useState<any | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const currentUser = users.find(u => (u._id || u.id) === currentUserId) || null;

    const setToken = (newToken: string | null) => {
        setTokenState(newToken);
        if (typeof window !== 'undefined') {
            if (newToken) {
                localStorage.setItem('sheet-delver-token', newToken);
            } else {
                localStorage.removeItem('sheet-delver-token');
            }
        }
    };

    const setStep = useCallback((newStep: ConnectionStep, origin: string = 'unknown', reason?: string) => {
        if (step === newStep) return;
        const timestamp = new Date().toISOString();
        logger.debug(`[FoundryProvider] ${timestamp} | ${step} -> ${newStep} | Origin: ${origin}${reason ? ` | Reason: ${reason}` : ''}`);
        setStepState(newStep);
    }, [step]);

    const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

    // --- Core Data Fetching ---

    const fetchChat = useCallback(async () => {
        if (step !== 'dashboard' || !token) return;
        try {
            const res = await fetch('/api/chat', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
            }
        } catch (e) {
            logger.error('FoundryProvider | Failed to fetch chat:', e);
        }
    }, [step, token]);

    const fetchActors = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/actors', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) return;
            const data = await res.json();
            if (data.ownedActors || data.actors) {
                setOwnedActors(data.ownedActors || data.actors || []);
                setReadOnlyActors(data.readOnlyActors || []);
            }
            return data;
        } catch (error: any) {
            logger.error('FoundryProvider | Fetch actors failed:', error.message);
        }
    }, [token]);

    const handleLogin = async (username: string, password?: string) => {
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                setToken(data.token);
                setStep('authenticating', 'handleLogin', 'Login success');
            } else {
                addNotification('Login failed: ' + data.error, 'error');
                throw new Error(data.error);
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
            throw e;
        }
    };

    const handleChatSend = async (message: string, options?: { rollMode?: string, speaker?: string }) => {
        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message,
                    rollMode: options?.rollMode,
                    speaker: options?.speaker
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchChat();
            } else {
                addNotification('Failed: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleLogout = async () => {
        try {
            setStep('login', 'handleLogout', 'User logged out');
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setToken(null);
        } catch (e: any) {
            logger.error('FoundryProvider | Logout error:', e);
            setStep('login', 'handleLogout error', 'Force transition');
            setToken(null);
        }
    };

    // --- Main Polling Loop ---

    useEffect(() => {
        const determineStep = (data: any, currentStep: string) => {
            const status = data.system?.status;
            const isAuthenticated = data.isAuthenticated || false;

            if (status !== 'active') return 'setup';
            if (data.initialized === false) return 'initializing';
            if (currentStep === 'authenticating') {
                return isAuthenticated ? 'dashboard' : 'authenticating';
            }

            const worldTitle = data.system?.worldTitle;
            const hasCompleteWorldData = worldTitle && worldTitle !== 'Reconnecting...';

            if (!hasCompleteWorldData) return 'startup';
            return isAuthenticated ? 'dashboard' : 'login';
        };

        const interval = setInterval(async () => {
            try {
                const headers: any = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch('/api/status', { headers, cache: 'no-store' });
                if (!res.ok) return;

                const data = await res.json();

                // Sync Log Level
                if (data.debug?.level !== undefined) {
                    logger.setLevel(data.debug.level);
                }

                if (data.url && typeof window !== 'undefined') {
                    // Sync foundryUrl to config if not set
                    const { setFoundryUrl, foundryUrl } = (window as any)._sd_config_actions || {};
                    if (setFoundryUrl && foundryUrl !== data.url) setFoundryUrl(data.url);
                }

                if (data.connected && data.system) {
                    if (!isEqual(system, data.system)) setSystem(data.system);
                    if (!isEqual(users, data.users)) setUsers(data.users || []);
                    if (currentUserId !== data.currentUserId) setCurrentUserId(data.currentUserId);
                    if (data.appVersion && appVersion !== data.appVersion) setAppVersion(data.appVersion);

                    // Actor Sync
                    const newToken = data.system?.actorSyncToken;
                    if (newToken && newToken !== lastActorSyncToken) {
                        setLastActorSyncToken(newToken);
                        if (data.isAuthenticated) fetchActors();
                    }

                    const targetStep = determineStep(data, step);
                    if (step !== targetStep) {
                        // Check if we are transitioning TO setup/offline (World Shutdown)
                        if (targetStep === 'setup' && step !== 'setup') {
                            logger.warn('FoundryProvider | World Shutdown detected. Clearing session.');
                            setToken(null);
                        }

                        setStep(targetStep as any, 'polling', `Status change: ${targetStep}`);
                        if (targetStep === 'dashboard') fetchActors();
                    }
                } else {
                    if (step !== 'setup') {
                        setStep('setup' as any, 'polling', 'Disconnected');
                        // Also clear token on disconnect to ensure fresh login
                        if (token) setToken(null);
                    }
                    if (data.appVersion && appVersion !== data.appVersion) setAppVersion(data.appVersion);
                }

                // Shared Content Polling (Consolidated)
                if (data.isAuthenticated && token) {
                    const scRes = await fetch('/api/shared-content', { headers, cache: 'no-store' });
                    if (scRes.ok) {
                        const scData = await scRes.json();
                        if (!isEqual(sharedContent, scData)) setSharedContent(scData);
                    }
                }
            } catch (e) {
                // Network error - assume disconnected
                if (step !== 'setup') {
                    setStep('setup', 'polling', 'Network Error');
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [step, token, fetchActors, setStep, system, users, currentUserId, sharedContent, appVersion]);

    // Chat Polling
    useEffect(() => {
        if (step === 'dashboard' && token) {
            fetchChat();
            const interval = setInterval(fetchChat, 5000);
            return () => clearInterval(interval);
        }
    }, [step, token, fetchChat]);

    return (
        <FoundryContext.Provider value={{
            step, setStep,
            token, setToken,
            users, currentUser,
            system, messages,
            appVersion,
            activeAdapter, setActiveAdapter,
            handleLogin, handleChatSend, handleLogout, fetchActors,
            ownedActors, readOnlyActors,
            sharedContent
        }}>
            {children}
        </FoundryContext.Provider>
    );
}

export function useFoundry() {
    const context = useContext(FoundryContext);
    if (!context) {
        throw new Error('useFoundry must be used within a FoundryProvider');
    }
    return context;
}
