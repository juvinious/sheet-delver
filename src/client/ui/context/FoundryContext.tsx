'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { logger } from '@shared/utils/logger';
import { AppSystemInfo, User, ConnectionStep, ActorCardData } from '@shared/interfaces';
import { useNotifications } from '../components/NotificationSystem';
import { getUIModule } from '@modules/registry/client';
import { UIModuleManifest } from '@shared/interfaces';
import { io, Socket } from 'socket.io-client';
import { useSession } from '@client/ui/context/SessionContext';
import { useActorCombat } from '@client/ui/context/ActorCombatContext';
import { UnauthorizedApiError } from '@client/ui/api/http';
import * as foundryApi from '@client/ui/api/foundryApi';
import type { AuthenticatedStatusPayload, SystemStatusPayload } from '@shared/contracts/status';
import type { ActorDto, ActorListPayload, ActorCardsPayload } from '@shared/contracts/actors';
import type { CombatDto, CombatListPayload } from '@shared/contracts/combats';
import type { ChatMessageDto, ChatLogPayload } from '@shared/contracts/chat';
import type {
    RealtimeSharedContentPayload,
    RealtimeCombatUpdatePayload,
    RealtimeChatUpdatePayload,
} from '@shared/contracts/realtime';

interface FoundryContextType {
    step: ConnectionStep;
    setStep: (step: ConnectionStep) => void;
    token: string | null;
    setToken: (token: string | null) => void;
    users: User[];
    currentUser: User | null;
    system: AppSystemInfo | null;
    messages: ChatMessageDto[];
    appVersion: string | null;
    activeUIModule: UIModuleManifest | null;
    actorCards: Record<string, ActorCardData>;
    fetchActorCards: () => Promise<ActorCardsPayload | void>;
    isConfigured: boolean;

    // Actions
    handleLogin: (username: string, password?: string) => Promise<void>;
    handleChatSend: (message: string, options?: { rollMode?: string, speaker?: string }) => Promise<void>;
    handleLogout: () => Promise<void>;
    fetchActors: () => Promise<ActorListPayload | void>;

    // Actors (Shared state)
    ownedActors: ActorDto[];
    readOnlyActors: ActorDto[];
    sharedContent: RealtimeSharedContentPayload | null;

    // Combats
    combats: CombatDto[];
    fetchCombats: () => Promise<CombatListPayload | void>;

    // Real-time
    appSocket: Socket | null;
}

const FoundryContext = createContext<FoundryContextType | undefined>(undefined);

export function FoundryProvider({ children }: { children: ReactNode }) {
    const { addNotification } = useNotifications();
    const {
        step,
        setStep,
        token,
        setToken,
        users,
        setUsers,
        currentUser,
        setCurrentUserId,
        appVersion,
        setAppVersion,
        isConfigured,
        setIsConfigured,
        handleLogin,
        handleLogout,
        registerLogoutCleanup,
    } = useSession();

    const {
        ownedActors,
        readOnlyActors,
        actorCards,
        combats,
        fetchActorCards,
        fetchActors,
        fetchCombats,
        resetActorCombatState,
    } = useActorCombat();

    const [system, setSystem] = useState<AppSystemInfo | null>(null);
    const [messages, setMessages] = useState<ChatMessageDto[]>([]);
    const lastActorSyncTokenRef = useRef<string | null>(null);
    const [appSocket, setAppSocket] = useState<Socket | null>(null);
    const [activeUIModule, setActiveUIModule] = useState<UIModuleManifest | null>(null);
    const [sharedContent, setSharedContent] = useState<RealtimeSharedContentPayload | null>(null);
    const [lastWorldId, setLastWorldId] = useState<string | null>(null);

    const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

    // --- Core Data Fetching ---

    const fetchChat = useCallback(async () => {
        if (step !== 'dashboard' || !token) return;
        try {
            const data = await foundryApi.fetchChatLog(token);
            if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
            }
        } catch (e) {
            if (e instanceof UnauthorizedApiError) {
                setToken(null);
                return;
            }
            logger.error('FoundryProvider | Failed to fetch chat:', e);
        }
    }, [step, token, setToken]);

    const handleChatSend = useCallback(async (message: string, options?: { rollMode?: string, speaker?: string }) => {
        try {
            const data = await foundryApi.sendChat(token, {
                message,
                rollMode: options?.rollMode,
                speaker: options?.speaker,
            });
            if (data.success) {
                fetchChat();
            } else {
                addNotification('Failed: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    }, [token, fetchChat, addNotification]);

    useEffect(() => {
        registerLogoutCleanup(() => {
            setCurrentUserId(null);
            resetActorCombatState();
            setSharedContent(null);
            setMessages([]);
        });
    }, [registerLogoutCleanup, resetActorCombatState, setCurrentUserId]);

    // --- App Socket & State Initialization ---
    useEffect(() => {
        let isMounted = true;

        const initStatus = async () => {
            try {
                // Fetch initial status to seed specific user data like currentUserId
                const data = await foundryApi.fetchStatus(token);
                if (!isMounted) return;

                if (data.currentUserId) setCurrentUserId(data.currentUserId);
                if (data.isConfigured !== undefined) setIsConfigured(data.isConfigured);

                // Fetch initial shared content
                if (token) {
                    const scData = await foundryApi.fetchSharedContent(token);
                    setSharedContent(scData);
                }
            } catch (e) {
                if (e instanceof UnauthorizedApiError) {
                    setToken(null);
                    return;
                }
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
    }, [token, setCurrentUserId, setIsConfigured, setToken]);

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
                        resetActorCombatState();
                        setUsers([]);
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

        const handleSharedContentUpdate = (scData: RealtimeSharedContentPayload) => {
            if (!isEqual(sharedContent, scData)) setSharedContent(scData);
        };

        appSocket.on('systemStatus', handleSystemStatus);
        appSocket.on('sharedContentUpdate', handleSharedContentUpdate);

        return () => {
            appSocket.off('systemStatus', handleSystemStatus);
            appSocket.off('sharedContentUpdate', handleSharedContentUpdate);
        };
    }, [appSocket, step, token, system, users, appVersion, sharedContent, fetchActors, resetActorCombatState, setAppVersion, setIsConfigured, setStep, setToken, setUsers, lastWorldId, isConfigured]);

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
                const handleCombatUpdate = (data: RealtimeCombatUpdatePayload) => {
                    //logger.debug('FoundryContext | Socket Combat Update received:', data);
                    fetchCombats();
                };
                const handleChatUpdate = (data: RealtimeChatUpdatePayload) => {
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
