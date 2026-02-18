'use client';

import { use, useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useFoundry } from '@/app/ui/context/FoundryContext';
import { getModule } from '@/modules/core/registry';
import LoadingModal from '@/app/ui/components/LoadingModal';

/**
 * Core actor page router.
 * Fetches the actor to determine its systemId, then delegates rendering
 * to the module-specific actorPage component registered in the module manifest.
 * No system-specific logic lives here.
 */
export default function ActorPageRouter({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { token } = useFoundry();
    const [ActorPage, setActorPage] = useState<React.ComponentType<{ actorId: string; token?: string | null }> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        async function resolveActorPage() {
            try {
                const headers: HeadersInit = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`/api/actors/${id}`, { headers });
                if (!res.ok) {
                    if (res.status === 401 || res.status === 503) {
                        router.push('/');
                        return;
                    }
                    setError(`Actor not found (${res.status})`);
                    return;
                }

                const data = await res.json();
                const systemId = data.systemId;

                if (!systemId) {
                    setError('Could not determine system for this actor.');
                    return;
                }

                const manifest = getModule(systemId);
                if (!manifest?.actorPage) {
                    setError(`No actor page registered for system: ${systemId}`);
                    return;
                }

                // actorPage may be a lazy component - resolve it
                setActorPage(() => manifest.actorPage as React.ComponentType<{ actorId: string; token?: string | null }>);
            } catch (e: any) {
                setError('Failed to load actor: ' + e.message);
            } finally {
                setLoading(false);
            }
        }

        resolveActorPage();
    }, [id, token, router]);

    if (loading) return <LoadingModal message="Loading..." />;

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white">
                <div className="text-center p-8 bg-black/40 rounded border border-white/10">
                    <h1 className="text-xl font-bold text-red-500 mb-2">Error</h1>
                    <p className="opacity-70 mb-4">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (!ActorPage) return null;

    return (
        <Suspense fallback={<LoadingModal message="Loading..." />}>
            <ActorPage actorId={id} token={token} />
        </Suspense>
    );
}
