import dynamic from 'next/dynamic';
import React, { ComponentType } from 'react';

// Registry of System Dashboard Tools
// This file is the ONLY place where frontend components from specific modules are imported.
// It acts as the bridge between generic UI and specific Module UI.

const SYSTEM_TOOLS: Record<string, ComponentType<any>> = {
    'shadowdark': dynamic(() => import('@/modules/shadowdark/ui/ShadowdarkDashboardTools'), {
        loading: () => <span className="opacity-50 text-xs">Loading Tools...</span>
    })
};

export function getSystemToolsComponent(systemId: string): ComponentType<any> | null {
    return SYSTEM_TOOLS[systemId.toLowerCase()] || null;
}
