'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ShadowdarkSheet from '@/components/sheets/ShadowdarkSheet';

export default function ActorDetail({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [actor, setActor] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const currentUserRef = useRef<string | null>(null);

    useEffect(() => {
        if (!id) return;

        // Initial fetch
        fetchActor(id);

        // Poll for updates
        const interval = setInterval(() => {
            fetchActor(id, true); // Pass true to silent loading
        }, 5000);

        return () => clearInterval(interval);
    }, [id]);

    const fetchActor = async (id: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`/api/actors/${id}`);
            const data = await res.json();
            // API now returns the actor object directly (mixed with debug info)
            if (data && !data.error) {
                setActor(data);
                if (data.currentUser) currentUserRef.current = data.currentUser;

                // Save to Recent Actors
                try {
                    const recent = JSON.parse(localStorage.getItem('recent_actors') || '[]');
                    const entry = { id: id, name: data.name, img: data.img, system: data.system?.details?.race || 'Unknown' };
                    // Remove existing if present
                    const filtered = recent.filter((r: any) => r.id !== id);
                    // Add to top, limit to 5
                    const updated = [entry, ...filtered].slice(0, 5);
                    localStorage.setItem('recent_actors', JSON.stringify(updated));
                } catch (e) {
                    console.error('Failed to save recent actor', e);
                }
            } else {
                if (!silent) {
                    // Redirect instead of alert
                    router.push('/');
                }
            }
        } catch (e) {
            console.error(e);
            if (!silent) router.push('/');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // ... (keep state definitions)
    const [messages, setMessages] = useState<any[]>([]);
    const [notifications, setNotifications] = useState<{ id: number, message: string, type: 'info' | 'success' | 'error' }[]>([]);

    const notificationIdRef = useRef(0);

    const addNotification = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
        const id = ++notificationIdRef.current;
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 20000); // 20 seconds as requested
    };

    const removeNotification = (id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const lastSeenTimestamp = useRef<number>(0);

    const fetchChat = async () => {
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
    };

    useEffect(() => {
        // Poll for chat
        const interval = setInterval(fetchChat, 3000);
        fetchChat();
        return () => clearInterval(interval);
    }, []);

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
                addNotification(`Rolled ${data.label}: ${data.result.total}`, 'success');
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
            }
        } catch (e: any) {
            addNotification('Error updating: ' + e.message, 'error');
        }
    };

    // ... (Keep existing loading/error checks)
    if (loading) return <div className="p-8 text-neutral-400">Loading...</div>;
    // If not loading and no actor, we are likely redirecting, so render specific fallback or null
    if (!actor) return null;

    // Detect system (fallback to shadowdark for now if unknown/missing)
    // The actor object from API might need to contain system info. 
    // For now we assume the current user is using Shadowdark as per context.
    const isShadowdark = true; // TODO: Check actor.system type or similar

    return (
        <main className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-amber-900 pb-20">
            {/* Navigation Header */}
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
            <div className="w-full max-w-5xl mx-auto p-4 pt-20">
                {isShadowdark ? (
                    <ShadowdarkSheet
                        actor={actor}
                        foundryUrl={actor?.foundryUrl}
                        messages={messages}
                        onRoll={handleRoll}
                        onChatSend={handleChatSend}
                        onUpdate={handleUpdate}
                    />
                ) : (
                    <div className="text-center p-10 mt-20 text-neutral-500 italic">
                        Unsupported System Configuration
                    </div>
                )}
            </div>

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
                        <p className="font-medium text-sm pr-6">{n.message}</p>
                    </div>
                ))}
            </div>

        </main>
    );
}
