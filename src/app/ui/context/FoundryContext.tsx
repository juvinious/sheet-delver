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
/*
 "tokenId": "aw61JwSg28QcPWj0",
            "sceneId": "NUEDEFAULTSCENE0",
            "actorId": "ZTYNPEZtHAuDXBl8",
            "hidden": false,
            "_id": "w49gyvcKg74czBbM",
            "type": "base",
            "system": {},
            "img": null,
            "initiative": 4,
            "defeated": false,
            "group": null,
            "flags": {},
            "_stats": {
*/
export interface Combatant {
    tokenId: string;
    sceneId: string;
    actorId: string;
    actor: any;
    hidden: boolean;
    _id: string;
    type: string;
    system: any;
    img: string | null;
    initiative: number;
    defeated: boolean;
    group: string | null;
    flags: any;
    _stats: any;
}

/*
"active": true,
    "_id": "BAs2dbhRcjLV10Hg",
    "type": "base",
    "system": {},
    "scene": null,
    "groups": [],
    "combatants": [],
    "round": 2,
    "turn": 0,
    "sort": 0,
    "flags": {},
    "_stats":
    */


export interface Combat {
    id: string;
    _id?: string;
    type: string;
    system: any;
    scene: string | null;
    groups: any[];
    combatants: Combatant[];
    round: number;
    turn: number;
    sort: number;
    flags: any;
    stats: any;
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

    // Combats
    combats: Combat[];
    fetchCombats: () => Promise<any>;
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
    const [lastWorldId, setLastWorldId] = useState<string | null>(null);
    const [combats, setCombats] = useState<Combat[]>([]);

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

    const fetchCombats = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/combats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) return;
            const data = await res.json();
            if (data.combats) {
                // Fetch actors for each combat
                const resolvedCombats = await Promise.all(data.combats.map(async (combat: any) => {
                    const combatants = await Promise.all((combat.combatants || []).map(async (combatant: any) => {
                        let actor = null;
                        if (combatant.actorId) {
                            try {
                                const actorRes = await fetch(`/api/actors/${combatant.actorId}`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                actor = await actorRes.json();
                            } catch (e) {
                                logger.error(`Failed fetching actor ${combatant.actorId}`, e);
                            }
                        }

                        const serializedCombatant: Combatant = {
                            tokenId: combatant.tokenId,
                            sceneId: combatant.sceneId,
                            actorId: combatant.actorId,
                            _id: combatant._id,
                            type: combatant.type,
                            system: combatant.system,
                            img: combatant.img,
                            actor: actor,
                            hidden: combatant.hidden,
                            initiative: combatant.initiative,
                            defeated: combatant.defeated,
                            group: combatant.group,
                            flags: combatant.flags,
                            _stats: combatant.stats
                        };
                        return serializedCombatant;
                    }));

                    return {
                        ...combat,
                        combatants
                    };
                }));

                setCombats(resolvedCombats);
            }
            return data;
        } catch (error: any) {
            logger.error('FoundryProvider | Fetch combat failed:', error.message);
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
                    // Check for world change BEFORE updating any state
                    const currentWorldId = data.worldId || null;
                    if (lastWorldId && currentWorldId && lastWorldId !== currentWorldId) {
                        logger.warn(`FoundryProvider | World changed from "${lastWorldId}" to "${currentWorldId}". Clearing token.`);
                        setToken(null);
                        setLastWorldId(currentWorldId);
                    } else if (currentWorldId && !lastWorldId) {
                        // First time seeing a world ID
                        setLastWorldId(currentWorldId);
                    }

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
                            setLastWorldId(null); // Reset world tracking
                        }

                        setStep(targetStep as any, 'polling', `Status change: ${targetStep}`);
                        if (targetStep === 'dashboard') fetchActors();
                    }
                } else {
                    if (step !== 'setup') {
                        setStep('setup' as any, 'polling', 'Disconnected');
                        // Also clear token on disconnect to ensure fresh login
                        if (token) setToken(null);
                        setLastWorldId(null); // Reset world tracking on disconnect
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

    // Chat and Combat Polling
    useEffect(() => {
        if (step === 'dashboard' && token) {
            fetchChat();
            fetchCombats(); // Initial fetch

            const chatInterval = setInterval(fetchChat, 5000);
            const combatInterval = setInterval(fetchCombats, 3000); // Poll combats faster than chat 

            return () => {
                clearInterval(chatInterval);
                clearInterval(combatInterval);
            };
        }
    }, [step, token, fetchChat, fetchCombats]);

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
            sharedContent,
            combats, fetchCombats
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
