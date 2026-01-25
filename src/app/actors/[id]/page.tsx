'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SheetRouter from '@/components/SheetRouter';
import GlobalChat from '@/components/GlobalChat';
import PlayerList from '@/components/PlayerList';
import { processHtmlContent } from '@/modules/core/utils';
import { getMatchingAdapter } from '@/modules/core/registry';

export default function ActorDetail({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [actor, setActor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const currentUserRef = useRef<string | null>(null);
    const foundryUrlRef = useRef<string | undefined>(undefined);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Chat State
    const [messages, setMessages] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<{ id: number, message: string, type: 'info' | 'success' | 'error' }[]>([]);

    const fetchActor = useCallback(async (id: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`/api/actors/${id}`);

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

    const notificationIdRef = useRef(0);

    const addNotification = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        // Ensure images in the toast are absolute URLs
        const content = processHtmlContent(message, foundryUrlRef.current);

        const id = ++notificationIdRef.current;
        setNotifications(prev => [...prev, { id, message: content, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 20000); // 20 seconds as requested
    };

    const removeNotification = (id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const lastSeenTimestamp = useRef<number>(0);

    const fetchChat = useCallback(async () => {
        try {
            const res = await fetch('/api/chat');
            const data = await res.json();
            if (data.messages) {
                const msgs = data.messages;
                if (msgs.length > 0) {
                    // Chat is now Newest -> Oldest (Index 0 is newest)
                    const newest = msgs[0];

                    // If we have seen messages before, check for new ones
                    if (lastSeenTimestamp.current > 0) {
                        // Find all messages newer than our last seen
                        const newMsgs = msgs.filter((m: any) => m.timestamp > lastSeenTimestamp.current);
                        newMsgs.forEach((m: any) => {
                            if (currentUserRef.current && m.user === currentUserRef.current) return;
                            if (m.isRoll) {
                                addNotification(`${m.user} rolled ${m.rollTotal}: ${m.flavor || 'Dice'}`, 'info');
                            } else {
                                addNotification(`${m.user}: ${m.content || 'Message'}`, 'info');
                            }
                        });
                    }

                    // Update our watermark
                    if (newest.timestamp > lastSeenTimestamp.current) {
                        lastSeenTimestamp.current = newest.timestamp;
                    }
                }
                setMessages(data.messages);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        // Poll for chat
        const interval = setInterval(fetchChat, 3000);
        fetchChat();
        return () => clearInterval(interval);
    }, [fetchChat]);

    useEffect(() => {
        if (!id) return;

        // Initial fetch
        fetchActor(id);

        // Poll for updates
        const interval = setInterval(() => {
            fetchActor(id, true); // Pass true to silent loading
        }, 5000);

        return () => clearInterval(interval);
    }, [id, fetchActor]);

    const handleChatSend = async (message: string) => {
        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            if (data.success) {
                if (data.type !== 'roll') {
                    addNotification('Message sent', 'info');
                }
                fetchChat(); // Update chat immediately
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
            const res = await fetch(`/api/actors/${actor.id}/roll`, {
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
                fetchChat(); // Update chat immediately
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
            const res = await fetch(`/api/actors/${actor.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [path]: value })
            });
            const data = await res.json();

            if (data.success) {
                // Squelch notification for frequent updates like HP, or make it subtle?
                // addNotification('Saved', 'info'); 
                fetchActor(actor.id, true);
            } else {
                addNotification('Update failed: ' + data.error, 'error');
                // Revert on failure
                fetchActor(actor.id, true); // Fetch true state
            }
        } catch (e: any) {
            addNotification('Error updating: ' + e.message, 'error');
            fetchActor(actor.id, true);
        }
    };

    const handleToggleEffect = async (effectId: string, enabled: boolean) => {
        if (!actor) return;
        try {
            const res = await fetch(`/api/actors/${actor.id}/effects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ effectId, updateData: { disabled: !enabled } })
            });
            const data = await res.json();
            if (data.success) {
                // Update local state optimistically
                fetchActor(actor.id, true);
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
        // Confirmation is handled by UI component now
        try {
            const res = await fetch(`/api/actors/${actor.id}/effects?effectId=${effectId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                const newEffects = actor.effects.filter((e: any) => e.id !== effectId);
                setActor({ ...actor, effects: newEffects });
                fetchActor(actor.id, true);
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
            const res = await fetch(`/api/actors/${actor.id}/items?itemId=${itemId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                // Optimistic update locally if possible, or just re-fetch
                // const newItems = actor.items?.filter((i: any) => i.id !== itemId);
                // setActor({...actor, items: newItems}); // Shallow might not work with complex struct
                fetchActor(actor.id, true);
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
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 animate-in fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/50 text-sm font-mono tracking-widest uppercase">Loading Codex...</p>
                </div>
            </div>
        );
    }
    // If not loading and no actor, we are likely redirecting, so render specific fallback or null
    // If not loading and no actor, check if we need to show the delete modal
    if (!actor && !showDeleteModal) return null;



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
                            isOwner={actor?.isOwner ?? true}
                            onRoll={handleRoll}
                            onUpdate={handleUpdate}
                            onToggleEffect={handleToggleEffect}
                            onDeleteEffect={handleDeleteEffect}
                            onDeleteItem={handleDeleteItem}
                            onToggleDiceTray={toggleDiceTray}
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
                    <PlayerList />
                </>
            )}

            {/* Notifications Container */}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
                {notifications.map(n => (
                    <div
                        key={n.id}
                        className={`relative p-4 rounded-lg shadow-2xl border-l-4 transform transition-all animate-in slide-in-from-right fade-in duration-300 ${n.type === 'success' ? 'bg-slate-800 border-green-500 text-green-100' :
                            n.type === 'error' ? 'bg-slate-800 border-red-500 text-red-100' :
                                'bg-slate-800 border-blue-500 text-blue-100'
                            }`}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                removeNotification(n.id);
                            }}
                            className="absolute top-2 right-2 text-current opacity-50 hover:opacity-100 p-1 rounded hover:bg-black/20 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <div
                            className="text-sm pr-6 [&_img]:max-h-16 [&_img]:w-auto [&_img]:object-contain [&_img]:rounded [&_img]:inline-block [&_img]:mr-2 [&_img]:align-middle [&_header]:font-bold [&_header]:mb-1 [&_header]:border-b [&_header]:border-white/20 [&_h3]:inline [&_h3]:m-0 [&_p]:m-0"
                            dangerouslySetInnerHTML={{
                                __html: n.message
                            }}
                        />
                    </div>
                ))}
            </div>

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
