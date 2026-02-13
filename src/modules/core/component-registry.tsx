import dynamic from 'next/dynamic';
import React, { ComponentType } from 'react';
import LoadingModal from '@/app/ui/components/LoadingModal';

// Registry of System Dashboard Tools
// This file is the ONLY place where frontend components from specific modules are imported.
// It acts as the bridge between generic UI and specific Module UI.

const SYSTEM_TOOLS: Record<string, ComponentType<any>> = {
    'shadowdark': dynamic(() => import('@/modules/shadowdark/ui/ShadowdarkDashboardTools'), {
        loading: () => <LoadingModal
            message="Loading Tools..."
            theme={{
                overlay: "absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity",
                container: "relative z-10 p-8 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-center space-y-4 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300",
                spinner: "w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto",
                text: "text-xl font-bold text-white font-sans"
            }}
        />
    })
};

export function getSystemToolsComponent(systemId: string): ComponentType<any> | null {
    return SYSTEM_TOOLS[systemId.toLowerCase()] || null;
}
