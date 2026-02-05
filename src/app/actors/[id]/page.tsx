'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import SheetRouter from '@/app/ui/components/SheetRouter';
import GlobalChat from '@/app/ui/components/GlobalChat';
import PlayerList from '@/app/ui/components/PlayerList';
import { processHtmlContent } from '@/modules/core/utils';
import { getMatchingAdapter } from '@/modules/core/registry';
import { useNotifications, NotificationContainer } from '@/app/ui/components/NotificationSystem';
import LoadingModal from '@/app/ui/components/LoadingModal';
import { SharedContentModal } from '@/app/ui/components/SharedContentModal';

export default function ActorDetail({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [actor, setActor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const currentUserRef = useRef<string | null>(null);
    const foundryUrlRef = useRef<string | undefined>(undefined);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [token, setToken] = useState<string | null>(null);

    // Load Token
    useEffect(() => {
        const stored = sessionStorage.getItem('sheet-delver-token');
        if (stored) setToken(stored);
    }, []);

    // Users State
    const [users, setUsers] = useState<any[]>([]);

    const fetchWithAuth = useCallback(async (input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const currentToken = token || sessionStorage.getItem('sheet-delver-token');
        if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
        return fetch(input, { ...init, headers });
    }, [token]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetchWithAuth('/api/users');
            const data = await res.json();
            if (data.users) {
                setUsers(data.users);
            }
        } catch (e) {
            console.error('Failed to fetch users', e);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchUsers();
        // Poll users every 10s
        const interval = setInterval(fetchUsers, 10000);
        return () => clearInterval(interval);
    }, [fetchUsers]);

    // Chat State
    const [messages, setMessages] = useState<any[]>([]);

    // Notifications
    const { notifications, addNotification: addToast, removeNotification } = useNotifications(4000);

    const addNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        // Ensure images in the toast are absolute URLs
        const content = processHtmlContent(message, foundryUrlRef.current);
        addToast(content, type, { html: true });
    }, [addToast]);

    const fetchWithAuthActor = useCallback(async (id: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetchWithAuth(`/api/actors/${id}`);

            // Handle Disconnected State (503)
            if (res.status === 503) {
                router.push('/');
                return;
            }

            // Handle Not Found (404) - Deleted
            if (res.status === 404) {
                setShowDeleteModal(true);
                return;
            }

            const data = await res.json();
            if (data && !data.error) {
                setActor(data);
                if (data.currentUser) currentUserRef.current = data.currentUser;
                if (data.foundryUrl) foundryUrlRef.current = data.foundryUrl;
            } else {
                if (!silent) setShowDeleteModal(true);
                else setShowDeleteModal(true);
            }
        } catch (e) {
            console.error(e);
            if (!silent) setShowDeleteModal(true);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [router]);

    // Lifted state for Universal Roller
    const [isDiceTrayOpen, setDiceTrayOpen] = useState(false);
    const toggleDiceTray = () => setDiceTrayOpen(prev => !prev);





    const seenMessageIds = useRef<Set<string>>(new Set());

    const fetchWithAuthChat = useCallback(async () => {
        try {
            const res = await fetchWithAuth('/api/chat');
            const data = await res.json();
            if (data.messages && Array.isArray(data.messages)) {
                const msgs = data.messages;

                // On first load (empty set), just populate the set without notifying
                if (seenMessageIds.current.size === 0 && msgs.length > 0) {
                    msgs.forEach((m: any) => seenMessageIds.current.add(m._id || m.id));
                } else if (msgs.length > 0) {
                    // Check for new messages
                    // msgs are Newest -> Oldest
                    // We iterate in reverse (Oldest -> Newest) to notify in order if multiple arrived
                    [...msgs].reverse().forEach((m: any) => {
                        const id = m._id || m.id;
                        if (!seenMessageIds.current.has(id)) {
                            seenMessageIds.current.add(id);

                            // Skip strictly own messages (optional, based on preference)
                            if (currentUserRef.current && m.user === currentUserRef.current) return;

                            if (m.isRoll) {
                                addNotification(`${m.user} rolled ${m.rollTotal}: ${m.flavor || 'Dice'}`, 'info');
                            } else {
                                addNotification(`${m.user}: ${m.content || 'Message'}`, 'info');
                            }
                        }
                    });
                }
                setMessages(data.messages);
            }
        } catch (e) {
            console.error(e);
        }
    }, [addNotification, fetchWithAuth]);

    useEffect(() => {
        // Poll for chat
        const interval = setInterval(fetchWithAuthChat, 3000);
        fetchWithAuthChat();
        return () => clearInterval(interval);
    }, [fetchWithAuthChat]);

    useEffect(() => {
        if (!id) return;

        // Initial fetchWithAuth
        fetchWithAuthActor(id);

        // Poll for updates
        const interval = setInterval(() => {
            fetchWithAuthActor(id, true); // Pass true to silent loading
        }, 5000);

        return () => clearInterval(interval);
    }, [id, fetchWithAuthActor]);

    const handleChatSend = async (message: string) => {
        try {
            const res = await fetchWithAuth('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            if (data.success) {
                if (data.type !== 'roll') {
                    addNotification('Message sent', 'info');
                }
                fetchWithAuthChat(); // Update chat immediately
            } else {
                addNotification('Failed: ' + data.error, 'error');
            }
        } catch (e) {
            addNotification('Error: ' + e, 'error');
        }
    };

    const handleRoll = async (type: string, key: string, options: any = {}) => {
        if (!actor) return;
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/roll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, key, options })
            });
            const data = await res.json();
            if (data.success) {
                if (data.html) {
                    addNotification(data.html, 'success');
                } else if (data.result?.total !== undefined) {
                    addNotification(`Rolled ${data.label || 'Result'}: ${data.result.total}`, 'success');
                } else {
                    addNotification(`${data.label || 'Item'} used`, 'success');
                }
                fetchWithAuthChat(); // Update chat immediately
            } else {
                addNotification('Roll failed: ' + data.error, 'error');
            }
        } catch (e) {
            addNotification('Error: ' + e, 'error');
        }
    };

    const handleUpdate = async (path: string, value: any) => {
        if (!actor) return;

        // Optimistic Update
        const optimisticActor = JSON.parse(JSON.stringify(actor));

        // Mapping for known mismatches between Foundry Path and Local Normalized Data
        const targetPath = path;
        // Add other mappings if needed, or implement a smarter adapter-aware updater.

        // Safety: Check if we can traverse.
        const parts = targetPath.split('.');
        let current = optimisticActor;
        let valid = true;

        for (let i = 0; i < parts.length - 1; i++) {
            // If missing, create it.
            if (current[parts[i]] === undefined || current[parts[i]] === null) {
                current[parts[i]] = {};
            }
            // If we hit a primitive where we expect an object, we can't traverse.
            else if (typeof current[parts[i]] !== 'object') {
                valid = false;
                break;
            }
            current = current[parts[i]];
        }

        if (valid) {
            current[parts[parts.length - 1]] = value;
            setActor(optimisticActor);
        }

        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [path]: value })
            });
            const data = await res.json();

            if (data.success) {
                // Squelch notification for frequent updates like HP, or make it subtle?
                // addNotification('Saved', 'info'); 
                fetchWithAuthActor(actor.id, true);
            } else {
                addNotification('Update failed: ' + data.error, 'error');
                // Revert on failure
                fetchWithAuthActor(actor.id, true); // Fetch true state
            }
        } catch (e: any) {
            addNotification('Error updating: ' + e.message, 'error');
            fetchWithAuthActor(actor.id, true);
        }
    };

    const handleToggleEffect = async (effectId: string, enabled: boolean) => {
        if (!actor) return;
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/effects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectId, updateData: { disabled: !enabled } })
            });
            const data = await res.json();
            if (data.success) {
                // Update local state optimistically
                fetchWithAuthActor(actor.id, true);
                addNotification(enabled ? 'Effect Enabled' : 'Effect Disabled', 'success');
            } else {
                addNotification('Failed to toggle effect: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleCreateItem = async (itemData: any) => {
        if (!actor) return;
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            const data = await res.json();
            if (data.success) {
                fetchWithAuthActor(actor.id, true);
                addNotification(`Created ${itemData.name}`, 'success');
            } else {
                addNotification('Failed to create item: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleUpdateItem = async (itemData: any, deletedEffectIds: string[] = []) => {
        if (!actor) return;
        try {
            // 1. Handle Deleted Effects first (if any)
            if (deletedEffectIds && deletedEffectIds.length > 0) {
                await Promise.all(deletedEffectIds.map(effId =>
                    fetchWithAuth(`/api/actors/${actor.id}/effects?effectId=${effId}`, { method: 'DELETE' })
                ));
            }

            // 2. Update Item
            const res = await fetchWithAuth(`/api/actors/${actor.id}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            const data = await res.json();

            if (data.success) {
                fetchWithAuthActor(actor.id, true);
                addNotification(`Updated ${itemData.name}`, 'success');
            } else {
                addNotification('Failed to update item: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleDeleteEffect = async (effectId: string) => {
        if (!actor) return;
        // Confirmation is handled by UI component now
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/effects?effectId=${effectId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                const newEffects = actor.effects.filter((e: any) => e.id !== effectId);
                setActor({ ...actor, effects: newEffects });
                fetchWithAuthActor(actor.id, true);
                addNotification('Effect Deleted', 'success');
            } else {
                addNotification('Failed to delete effect: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!actor) return;
        // Confirmation is handled by UI component now
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/items?itemId=${itemId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                // Optimistic update locally if possible, or just re-fetchWithAuth
                // const newItems = actor.items?.filter((i: any) => i.id !== itemId);
                // setActor({...actor, items: newItems}); // Shallow might not work with complex struct
                fetchWithAuthActor(actor.id, true);
                addNotification('Item Deleted', 'success');
            } else {
                addNotification('Failed to delete item: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };



    // ... (Keep existing loading/error checks)
    // ... (Keep existing loading/error checks)

    // ...

    if (loading) {
        return <LoadingModal message="Loading Codex..." />;
    }
    // If not loading and no actor, we are likely redirecting, so render specific fallback or null
    // If not loading and no actor, check if we need to show the delete modal
    if (!actor && !showDeleteModal) return null;





    const handleLogout = () => {
        sessionStorage.removeItem('sheet-delver-token');
        setToken(null);
        router.push('/');
    };

    return (
        <main className="min-h-screen font-sans selection:bg-amber-900 pb-20">
            {/* Navigation Header - Hide for Mork Borg? or Style it? */}
            {/* Leaving it for now, but removing page bg so MorkBorgSheet can take over */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 shadow-md flex items-center justify-between backdrop-blur-sm bg-opacity-95">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 text-neutral-400 hover:text-amber-500 transition-colors font-semibold group text-sm uppercase tracking-wide"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    Back to Dashboard
                </button>
                <div className="text-xs text-neutral-600 font-mono hidden md:block">
                    {actor?.name ? `Editing: ${actor.name}` : 'Loading...'}
                </div>
            </nav>

            {/* Main Content */}
            {actor && (
                <>
                    <div className="w-full max-w-5xl mx-auto p-4 pt-20">
                        <SheetRouter
                            systemId={actor.systemId || 'generic'}
                            actor={actor}
                            foundryUrl={actor?.foundryUrl}
                            token={token}
                            isOwner={actor?.isOwner ?? true}
                            onRoll={handleRoll}
                            onUpdate={handleUpdate}
                            onToggleEffect={handleToggleEffect}
                            onDeleteEffect={handleDeleteEffect}
                            onDeleteItem={handleDeleteItem}
                            onCreateItem={handleCreateItem}
                            onUpdateItem={handleUpdateItem}
                            onToggleDiceTray={toggleDiceTray}
                            isDiceTrayOpen={isDiceTrayOpen}
                        />
                    </div>

                    {/* Global Chat Overlay */}
                    <GlobalChat
                        messages={messages}
                        onSend={handleChatSend}
                        onRoll={handleRoll}
                        foundryUrl={actor?.foundryUrl}
                        adapter={getMatchingAdapter(actor)}
                        isDiceTrayOpen={isDiceTrayOpen}
                        onToggleDiceTray={toggleDiceTray}
                    />

                    {/* Player List */}
                    <PlayerList users={users} onLogout={handleLogout} />
                </>
            )}

            {/* Notifications Container */}
            <NotificationContainer notifications={notifications} removeNotification={removeNotification} />

            {/* Shared Content Overlay */}
            <SharedContentModal token={token} foundryUrl={actor?.foundryUrl || ''} />

            {/* Deletion Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-neutral-900 border border-amber-500/30 p-8 rounded-xl max-w-md w-full text-center shadow-2xl">
                        <div className="text-5xl mb-4">💀</div>
                        <h2 className="text-2xl font-bold text-white mb-2 font-serif">Character Deleted</h2>
                        <p className="text-neutral-400 mb-8">
                            This character has been deleted from the world.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded shadow-lg uppercase tracking-widest transition-all w-full"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            )}

        </main>
    );
}
