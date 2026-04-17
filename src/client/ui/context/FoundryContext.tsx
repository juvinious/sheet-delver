'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { logger, LOG_LEVEL } from '@shared/utils/logger';
import { AppSystemInfo, User, Combat, Combatant, ConnectionStep, ActorCardData } from '@shared/interfaces';
import { useNotifications } from '../components/NotificationSystem';
import { getUIModule } from '@modules/registry/client';
import { UIModuleManifest } from '@shared/interfaces';
import { io, Socket } from 'socket.io-client';
import { useUI } from '@client/ui/context/UIContext';
import type { AuthenticatedStatusPayload, SystemStatusPayload } from '@shared/contracts/status';
import type { ActorDto, ActorListPayload, ActorCardsPayload } from '@shared/contracts/actors';

interface FoundryContextType {
    step: ConnectionStep;
    setStep: (step: ConnectionStep) => void;
    token: string | null;
    setToken: (token: string | null) => void;
    users: User[];
    currentUser: User | null;
    system: AppSystemInfo | null;
    messages: any[];
    appVersion: string | null;
    activeUIModule: UIModuleManifest | null;
    actorCards: Record<string, ActorCardData>;
    fetchActorCards: () => Promise<void>;
    isConfigured: boolean;

    // Actions
    handleLogin: (username: string, password?: string) => Promise<void>;
    handleChatSend: (message: string, options?: { rollMode?: string, speaker?: string }) => Promise<void>;
    handleLogout: () => Promise<void>;
    fetchActors: () => Promise<ActorListPayload | void>;

    // Actors (Shared state)
    ownedActors: ActorDto[];
    readOnlyActors: ActorDto[];
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
    const { resetUI } = useUI();
    const [step, setStepState] = useState<ConnectionStep>('init');
    const [token, setTokenState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sheet-delver-token');
        }
        return null;
    });

    const [users, setUsers] = useState<User[]>([]);
    const [system, setSystem] = useState<AppSystemInfo | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [appVersion, setAppVersion] = useState<string | null>(null);
    const lastActorSyncTokenRef = useRef<string | null>(null);
    const [combatSyncToken, setCombatSyncToken] = useState<number>(0);
    const [appSocket, setAppSocket] = useState<Socket | null>(null);
    const [activeUIModule, setActiveUIModule] = useState<UIModuleManifest | null>(null);
    const [ownedActors, setOwnedActors] = useState<ActorDto[]>([]);
    const [readOnlyActors, setReadOnlyActors] = useState<ActorDto[]>([]);
    const [sharedContent, setSharedContent] = useState<any | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [lastWorldId, setLastWorldId] = useState<string | null>(null);
    const [combats, setCombats] = useState<Combat[]>([]);
    const [actorCards, setActorCards] = useState<Record<string, ActorCardData>>({});
    const [isConfigured, setIsConfigured] = useState<boolean>(true);

    const currentUser = users.find(u => (u._id || u.id) === currentUserId) || null;

    const setToken = useCallback((newToken: string | null) => {
        setTokenState(newToken);
        if (typeof window !== 'undefined') {
            if (newToken) {
                localStorage.setItem('sheet-delver-token', newToken);
            } else {
                localStorage.removeItem('sheet-delver-token');
            }
        }
    }, []);

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

    const lastActorFetchTimeRef = useRef<number>(0);
    const FETCH_THROTTLE_MS = 2000;

    const fetchActorCards = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/actors/cards', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) {
                setToken(null);
                return;
            }
            const data = await res.json() as ActorCardsPayload;
            setActorCards(data || {});
        } catch (e) {
            logger.error('FoundryProvider | Failed to fetch actor cards:', e);
        }
    }, [token, setToken]);

    const fetchActors = useCallback(async () => {
        if (!token) return;

        // Simple throttle to prevent rapid-fire requests from multiple socket events
        const now = Date.now();
        if (now - lastActorFetchTimeRef.current < FETCH_THROTTLE_MS) {
            logger.debug('FoundryProvider | Skipping fetchActors (throttled)');
            return;
        }

        lastActorFetchTimeRef.current = now;

        try {
            const res = await fetch('/api/actors', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) {
                setToken(null);
                return;
            }
            const data = await res.json() as ActorListPayload;
            if (data.ownedActors || data.actors) {
                setOwnedActors(data.ownedActors || data.actors || []);
                setReadOnlyActors(data.readOnlyActors || []);
                
                // Fetch corresponding actor cards for the dashboard
                fetchActorCards();
            }
            return data;
        } catch (error: any) {
            logger.error('FoundryProvider | Fetch actors failed:', error.message);
        }
    }, [token, fetchActorCards, setToken]);

    const fetchCombats = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/combats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 401) {
                setToken(null);
                return;
            }
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
    }, [token, setToken]);

    const handleLogin = useCallback(async (username: string, password?: string) => {
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
    }, [setToken, setStep, addNotification]);

    const handleChatSend = useCallback(async (message: string, options?: { rollMode?: string, speaker?: string }) => {
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
    }, [token, fetchChat, addNotification]);

    const handleLogout = useCallback(async () => {
        try {
            resetUI();
            setStep('login', 'handleLogout', 'User logged out');
            setCurrentUserId(null);
            setOwnedActors([]);
            setReadOnlyActors([]);
            setSharedContent(null);
            setCombats([]);
            setMessages([]);

            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setToken(null);
        } catch (e: any) {
            logger.error('FoundryProvider | Logout error:', e);
            resetUI();
            setStep('login', 'handleLogout error', 'Force transition');
            setCurrentUserId(null);
            setOwnedActors([]);
            setReadOnlyActors([]);
            setSharedContent(null);
            setCombats([]);
            setMessages([]);
            setToken(null);
        }
    }, [token, resetUI, setStep, setToken]);

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

                const data = await res.json() as Partial<AuthenticatedStatusPayload>;
                if (!isMounted) return;

                if (data.currentUserId) setCurrentUserId(data.currentUserId);
                if (data.isConfigured !== undefined) setIsConfigured(data.isConfigured);

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
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 5000,
            randomizationFactor: 0.5,
            timeout: 10000,
            transports: ['polling', 'websocket']
        });

        socket.on('connect', () => {
            logger.debug('FoundryContext | App Socket Connected');
        });

        socket.on('connect_error', (err) => {
            const isNoisyError = err.message === 'xhr poll error' || 
                                err.message === 'websocket error' ||
                                err.message.includes('timeout');

            if (isNoisyError) {
                // Log as debug during reconnection attempts to avoid console red spray
                logger.debug('FoundryContext | App Socket Reconnection attempt failed:', err.message);
            } else {
                logger.error('FoundryContext | App Socket Connection Error:', err.message);
            }
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

        const determineStep = (data: SystemStatusPayload, currentStep: string, configured: boolean) => {
            const status = data.system?.status || (data.connected ? 'active' : 'offline');
            const isAuthenticated = !!token;

            if (!configured) return 'setup';
            const worldTitle = data.system?.worldTitle;

            // Priority 1: Explicit System States (Setup/Offline/Startup)
            if (status === 'setup') return 'world-closed';
            if (status === 'offline') {
                // If we discovered a world title during the probe, we are in 'startup'
                // If not, we are still 'initializing' or waiting for the server to wake up.
                // Critical: Do NOT jump to 'setup' here based on uncertainty.
                return worldTitle ? 'startup' : 'initializing';
            }
            if (status === 'startup') return 'startup';

            // Priority 2: Backend Initialization (Wait until Cache + Discovery is ready)
            if (!data.connected || data.initialized === false) {
                // Return 'startup' if we have world information, otherwise indicate 'initialization'
                return worldTitle ? 'startup' : 'initializing';
            }

            if (currentStep === 'authenticating') {
                return isAuthenticated ? 'dashboard' : 'authenticating';
            }

            if (!worldTitle) return 'startup';

            // If connected and active, but no token, we must be at login
            return isAuthenticated ? 'dashboard' : 'login';
        };

        const handleSystemStatus = (data: SystemStatusPayload) => {
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
                        logger.warn(`FoundryProvider | World changed from "${lastWorldId}" to "${currentWorldId}". Purging state.`);
                        
                        // Aggressive state purge to prevent cross-world contamination
                        if (token) setToken(null);
                        setOwnedActors([]);
                        setReadOnlyActors([]);
                        setActorCards({});
                        setUsers([]);
                        setCombats([]);
                        setMessages([]);
                        setSharedContent(null);
                        
                        setLastWorldId(currentWorldId);
                    } else if (data.connected && currentWorldId && !lastWorldId) {
                        setLastWorldId(currentWorldId);
                    }

                    // Allow system data to update from probe data even when not fully connected.
                    // This ensures world title/description appear in the 'world-closed' state.
                    if (!isEqual(system, data.system)) setSystem(data.system);
                    if (data.connected && !isEqual(users, data.users)) setUsers((data.users || []) as User[]);
                    if (data.appVersion && appVersion !== data.appVersion) setAppVersion(data.appVersion);
                    if (data.isConfigured !== undefined && isConfigured !== data.isConfigured) setIsConfigured(data.isConfigured);

                    const newToken = data.system?.actorSyncToken;
                    if (data.connected && newToken && newToken !== lastActorSyncTokenRef.current) {
                        lastActorSyncTokenRef.current = newToken;
                        if (token) fetchActors();
                    }

                    const targetStep = determineStep(data, step, isConfigured);
                    if (step !== targetStep) {
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
    }, [appSocket, step, token, system, users, appVersion, sharedContent, fetchActors, setStep, setToken, lastWorldId]);

    // Hydrate activeAdapter and activeUIModule when system changes
    useEffect(() => {
        let isMounted = true;
        async function hydrateUI() {
            if (system?.id) {
                const uiManifest = await getUIModule(system.id);
                if (isMounted) {
                    setActiveUIModule(uiManifest || null);
                }
            } else {
                if (isMounted) {
                    setActiveUIModule(null);
                }
            }
        }
        hydrateUI();
        return () => { isMounted = false; };
    }, [system?.id]);

    // Chat and Combat Real-time Sync
    useEffect(() => {
        if (step === 'dashboard' && token) {
            fetchChat();
            fetchCombats(); // Initial fetch

            if (appSocket) {
                const handleCombatUpdate = (data: any) => {
                    //logger.debug('FoundryContext | Socket Combat Update received:', data);
                    fetchCombats();
                };
                const handleChatUpdate = (data: any) => {
                    //logger.debug('FoundryContext | Socket Chat Update received:', data);
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

    const contextValue = React.useMemo(() => ({
        step, setStep,
        token, setToken,
        users, currentUser,
        system, messages,
        appVersion,
        activeUIModule,
        actorCards,
        fetchActorCards,
        isConfigured,
        handleLogin, handleChatSend, handleLogout, fetchActors,
        ownedActors, readOnlyActors,
        sharedContent,
        combats, fetchCombats,
        appSocket
    }), [
        step, setStep, token, users, currentUser, system, messages,
        appVersion, activeUIModule, actorCards, ownedActors, readOnlyActors,
        sharedContent, combats, appSocket, isConfigured,
        fetchActorCards, handleLogin, handleChatSend, handleLogout, fetchActors, fetchCombats, setToken
    ]);

    return (
        <FoundryContext.Provider value={contextValue}>
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
