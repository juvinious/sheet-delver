'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { logger, LOG_LEVEL } from '../logger';
import { SystemInfo } from '@/shared/interfaces';
import { useNotifications } from '../components/NotificationSystem';
import { getModule } from '@/modules/core/registry';
import { io, Socket } from 'socket.io-client';
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

    // Real-time
    appSocket: Socket | null;
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
    const lastActorSyncTokenRef = useRef<number>(0);
    const [combatSyncToken, setCombatSyncToken] = useState<number>(0);
    const [appSocket, setAppSocket] = useState<Socket | null>(null);
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

    // --- App Socket & State Initialization ---
    useEffect(() => {
        let isMounted = true;

        const initStatus = async () => {
            try {
                const headers: any = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                // Fetch initial status to seed specific user data like currentUserId
                const res = await fetch('/api/status', { headers, cache: 'no-store' });
                if (!res.ok) return;

                const data = await res.json();
                if (!isMounted) return;

                if (data.currentUserId) setCurrentUserId(data.currentUserId);

                // Fetch initial shared content
                if (token) {
                    const scRes = await fetch('/api/shared-content', { headers, cache: 'no-store' });
                    if (scRes.ok) {
                        const scData = await scRes.json();
                        setSharedContent(scData);
                    }
                }
            } catch (e) {
                logger.error('FoundryProvider | Initial status fetch failed', e);
            }
        };

        initStatus();

        // Connect socket unconditionally to receive global system statuses (Guest Mode)
        // If auth token is present, server joins us to the 'authenticated' room
        const socket = io({
            auth: token ? { token } : {},
            reconnectionAttempts: 5,
            transports: ['polling', 'websocket']
        });

        socket.on('connect', () => {
            logger.debug('FoundryContext | App Socket Connected');
        });

        socket.on('connect_error', (err) => {
            logger.error('FoundryContext | App Socket Connection Error:', err.message);
        });

        setAppSocket(socket);

        return () => {
            isMounted = false;
            socket.disconnect();
            setAppSocket(null);
        };
    }, [token]);

    // --- Real-time Socket Status Sync ---
    useEffect(() => {
        if (!appSocket) return;

        const determineStep = (data: any, currentStep: string) => {
            const status = data.system?.status || (data.connected ? 'active' : 'offline');
            const isAuthenticated = !!token;

            if (status === 'setup') return 'setup';
            if (!data.connected) return 'initializing';
            if (status === 'offline') return 'initializing'; // Still trying to connect
            if (status === 'startup') return 'startup';
            if (status !== 'active') return 'setup';

            if (currentStep === 'authenticating') {
                return isAuthenticated ? 'dashboard' : 'authenticating';
            }

            const worldTitle = data.system?.worldTitle;
            const hasCompleteWorldData = worldTitle && worldTitle !== 'Reconnecting...';

            if (!hasCompleteWorldData) return 'startup';
            return isAuthenticated ? 'dashboard' : 'login';
        };

        const handleSystemStatus = (data: any) => {
            try {
                if (data.debug?.level !== undefined) {
                    logger.setLevel(data.debug.level);
                }

                if (data.url && typeof window !== 'undefined') {
                    const { setFoundryUrl, foundryUrl } = (window as any)._sd_config_actions || {};
                    if (setFoundryUrl && foundryUrl !== data.url) setFoundryUrl(data.url);
                }

                // Treat both active and offline as valid payloads for determining step
                if (data.system) {
                    const currentWorldId = data.worldId || null;
                    if (data.connected && lastWorldId && currentWorldId && lastWorldId !== currentWorldId) {
                        logger.warn(`FoundryProvider | World changed from "${lastWorldId}" to "${currentWorldId}". Clearing token.`);
                        if (token) setToken(null);
                        setLastWorldId(currentWorldId);
                    } else if (data.connected && currentWorldId && !lastWorldId) {
                        setLastWorldId(currentWorldId);
                    }

                    if (data.connected && !isEqual(system, data.system)) setSystem(data.system);
                    if (data.connected && !isEqual(users, data.users)) setUsers(data.users || []);
                    if (data.appVersion && appVersion !== data.appVersion) setAppVersion(data.appVersion);

                    const newToken = data.system?.actorSyncToken;
                    if (data.connected && newToken && newToken !== lastActorSyncTokenRef.current) {
                        lastActorSyncTokenRef.current = newToken;
                        if (token) fetchActors();
                    }

                    const targetStep = determineStep(data, step);
                    if (step !== targetStep) {
                        if (targetStep === 'setup' && step !== 'setup') {
                            logger.warn('FoundryProvider | World explicitly in Setup mode. Clearing session.');
                            if (token) setToken(null);
                            setLastWorldId(null);
                        }
                        setStep(targetStep as any, 'socket', `Status change: ${targetStep}`);
                        if (targetStep === 'dashboard' && data.connected) fetchActors();
                    }
                }
            } catch (e) {
                logger.error('FoundryProvider | Error handling system status:', e);
            }
        };

        const handleSharedContentUpdate = (scData: any) => {
            if (!isEqual(sharedContent, scData)) setSharedContent(scData);
        };

        appSocket.on('systemStatus', handleSystemStatus);
        appSocket.on('sharedContentUpdate', handleSharedContentUpdate);

        return () => {
            appSocket.off('systemStatus', handleSystemStatus);
            appSocket.off('sharedContentUpdate', handleSharedContentUpdate);
        };
    }, [appSocket, step, token, system, users, appVersion, sharedContent, fetchActors, setStep, lastWorldId]);

    // Chat and Combat Real-time Sync
    useEffect(() => {
        if (step === 'dashboard' && token) {
            fetchChat();
            fetchCombats(); // Initial fetch

            if (appSocket) {
                const handleCombatUpdate = (data: any) => {
                    logger.debug('FoundryContext | Socket Combat Update received:', data);
                    fetchCombats();
                };
                const handleChatUpdate = (data: any) => {
                    logger.debug('FoundryContext | Socket Chat Update received:', data);
                    fetchChat();
                };

                appSocket.on('combatUpdate', handleCombatUpdate);
                appSocket.on('chatUpdate', handleChatUpdate);

                return () => {
                    appSocket.off('combatUpdate', handleCombatUpdate);
                    appSocket.off('chatUpdate', handleChatUpdate);
                };
            }
        }
    }, [step, token, fetchChat, fetchCombats, appSocket]);

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
            combats, fetchCombats,
            appSocket
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
