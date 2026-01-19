'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { getTool } from '@/modules/core/registry';

// Dynamic route component
export default function ToolPage({ params }: { params: Promise<{ systemId: string, toolId: string }> }) {
    // Unguard the params promise
    const resolvedParams = use(params);
    const { systemId, toolId } = resolvedParams;

    const [ToolComponent, setToolComponent] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const component = getTool(systemId, toolId);
        if (component) {
            setToolComponent(component);
        } else {
            setError(`Tool '${toolId}' for system '${systemId}' not found.`);
        }
    }, [systemId, toolId]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white">
                <div className="text-center p-8 bg-black/40 rounded border border-white/10">
                    <h1 className="text-xl font-bold text-red-500 mb-2">Error Loading Tool</h1>
                    <p className="opacity-70">{error}</p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (!ToolComponent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white">
                <div className="animate-pulse text-amber-500">Loading Tool...</div>
            </div>
        );
    }

    return <ToolComponent />;
}
