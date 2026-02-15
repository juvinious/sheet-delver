'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import SheetRouter from '@/app/ui/components/SheetRouter';
import { useFoundry } from '@/app/ui/context/FoundryContext';
import { useUI } from '@/app/ui/context/UIContext';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { processHtmlContent } from '@/modules/core/utils';
import { getMatchingAdapter } from '@/modules/core/registry';
import { useNotifications } from '@/app/ui/components/NotificationSystem';
import LoadingModal from '@/app/ui/components/LoadingModal';
import { SharedContentModal } from '@/app/ui/components/SharedContentModal';

export default function ActorDetail({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const {
        token, users, currentUser, messages,
        handleChatSend: globalChatSend,
        fetchActors, setActiveAdapter
    } = useFoundry();
    const { isDiceTrayOpen, toggleDiceTray } = useUI();
    const { addNotification: addToast } = useNotifications();
    const { foundryUrl, setFoundryUrl } = useConfig();

    const [actor, setActor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const currentUserId = currentUser?._id || currentUser?.id || null;

    const fetchWithAuth = useCallback(async (input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(input, { ...init, headers });
    }, [token]);

    const foundryUrlRef = useRef(foundryUrl);
    useEffect(() => { foundryUrlRef.current = foundryUrl; }, [foundryUrl]);

    const addNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        const content = processHtmlContent(message, foundryUrlRef.current);
        addToast(content, type, { html: true });
    }, [addToast]);

    const fetchWithAuthActor = useCallback(async (actorId: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetchWithAuth(`/api/actors/${actorId}`);
            if (res.status === 503 || res.status === 401) {
                router.push('/');
                return;
            }
            if (res.status === 404) {
                setShowDeleteModal(true);
                return;
            }

            const data = await res.json();
            if (data && !data.error) {
                setActor(data);
                if (data.foundryUrl) setFoundryUrl(data.foundryUrl);

                // Set active adapter for global UI
                const adapter = getMatchingAdapter(data);
                setActiveAdapter(adapter);
            } else {
                if (res.status >= 500) {
                    addNotification('Server Error: ' + (data?.error || 'Unknown Error'), 'error');
                } else {
                    setShowDeleteModal(true);
                }
            }
        } catch (e: any) {
            addNotification('Connection Error: ' + e.message, 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [router, fetchWithAuth, addNotification, setFoundryUrl, setActiveAdapter]);

    const loadingRef = useRef(loading);
    useEffect(() => { loadingRef.current = loading; }, [loading]);

    useEffect(() => {
        if (!id) return;
        fetchWithAuthActor(id);
        const interval = setInterval(() => fetchWithAuthActor(id, true), 5000);

        // Loading timeout
        const timeout = setTimeout(() => {
            if (loadingRef.current) {
                addNotification('Loading is taking longer than expected. The server might be busy.', 'error');
            }
        }, 15000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [id, fetchWithAuthActor, addNotification]);

    // Cleanup active adapter on unmount
    useEffect(() => {
        return () => setActiveAdapter(null);
    }, [setActiveAdapter]);

    const handleChatSend = async (message: string, options?: { rollMode?: string, speaker?: any }) => {
        try {
            await globalChatSend(message, {
                ...options,
                speaker: options?.speaker || { actor: actor?.id, alias: actor?.name }
            });
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleRoll = async (type: string, key: string, options: any = {}) => {
        if (!actor) return;
        const rollMode = localStorage.getItem('sheetdelver_roll_mode') || 'publicroll';
        const rollOptions = {
            ...options,
            rollMode: options.rollMode || rollMode,
            speaker: options.speaker || { actor: actor.id, alias: actor.name }
        };

        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/roll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, key, options: rollOptions })
            });
            const data = await res.json();
            if (data.success) {
                if (data.html) addNotification(data.html, 'success');
                else if (data.result?.total !== undefined) addNotification(`Rolled ${data.label || 'Result'}: ${data.result.total}`, 'success');
                else addNotification(`${data.label || 'Item'} used`, 'success');
            } else {
                addNotification('Roll failed: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleUpdate = async (path: string, value: any) => {
        if (!actor) return;
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [path]: value })
            });
            const data = await res.json();
            if (data.success) fetchWithAuthActor(actor.id, true);
            else addNotification('Update failed: ' + data.error, 'error');
        } catch (e: any) {
            addNotification('Error updating: ' + e.message, 'error');
        }
    };

    const handleToggleEffect = async (effectId: string, enabled: boolean) => {
        if (!actor) return;
        try {
            const id = actor.id || actor._id;
            const res = await fetchWithAuth(`/api/modules/shadowdark/actors/${id}/effects/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: effectId, disabled: !enabled })
            });
            const data = await res.json();
            if (data.success) {
                fetchWithAuthActor(actor.id, true);
                addNotification(enabled ? 'Effect Enabled' : 'Effect Disabled', 'success');
            } else {
                addNotification('Failed to toggle effect: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleDeleteEffect = async (effectId: string) => {
        if (!actor) return;
        try {
            const id = actor.id || actor._id;
            const res = await fetchWithAuth(`/api/modules/shadowdark/actors/${id}/effects/delete?effectId=${effectId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
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
        try {
            const res = await fetchWithAuth(`/api/actors/${actor.id}/items?itemId=${itemId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                fetchWithAuthActor(actor.id, true);
                addNotification('Item Deleted', 'success');
            } else {
                addNotification('Failed to delete item: ' + data.error, 'error');
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
                if (itemData.name) addNotification(`Created ${itemData.name}`, 'success');
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
            if (deletedEffectIds.length > 0) {
                await Promise.all(deletedEffectIds.map(effId =>
                    fetchWithAuth(`/api/modules/shadowdark/actors/${actor.id || actor._id}/effects/delete?effectId=${effId}`, { method: 'DELETE' })
                ));
            }
            const res = await fetchWithAuth(`/api/actors/${actor.id}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            const data = await res.json();
            if (data.success) {
                fetchWithAuthActor(actor.id, true);
                if (itemData.name) addNotification(`Updated ${itemData.name}`, 'success');
            } else {
                addNotification('Failed to update item: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleTogglePredefinedEffect = async (effectId: string) => {
        if (!actor) return;
        try {
            const id = actor.id || actor._id;
            const res = await fetchWithAuth(`/api/modules/shadowdark/actors/${id}/effects/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectId })
            });
            const data = await res.json();
            if (data.success) {
                fetchWithAuthActor(id, true);
                addNotification('Effect toggled', 'success');
            } else {
                addNotification('Failed to toggle effect: ' + data.error, 'error');
            }
        } catch (e: any) {
            addNotification('Error: ' + e.message, 'error');
        }
    };

    const handleLogout = () => router.push('/');

    if (loading) return <LoadingModal message="Loading Codex..." />;
    if (!actor && !showDeleteModal) return null;

    return (
        <main className="min-h-screen font-sans selection:bg-amber-900 pb-20">
            <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 shadow-md flex items-center justify-between backdrop-blur-sm bg-opacity-95">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 text-neutral-400 hover:text-amber-500 transition-colors font-semibold group text-sm uppercase tracking-wide cursor-pointer"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    Back to Dashboard
                </button>
                <div className="text-xs text-neutral-600 font-mono hidden md:block">
                    {actor?.name ? `${actor.name}` : 'Loading...'}
                </div>
            </nav>

            {actor && (
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
                        onAddPredefinedEffect={handleTogglePredefinedEffect}
                        onToggleDiceTray={toggleDiceTray}
                        isDiceTrayOpen={isDiceTrayOpen}
                    />
                </div>
            )}

            <SharedContentModal />

            {showDeleteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-neutral-900 border border-amber-500/30 p-8 rounded-xl max-w-md w-full text-center shadow-2xl">
                        <div className="text-5xl mb-4">💀</div>
                        <h2 className="text-2xl font-bold text-white mb-2 font-serif">Character Deleted</h2>
                        <p className="text-neutral-400 mb-8">This character has been deleted from the world.</p>
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
