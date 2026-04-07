import React from 'react';
import { UIModuleManifest } from '@modules/registry';
import info from '../info.json';
import LoadingModal from '@client/ui/components/LoadingModal';

const ShadowdarkLoading = () => (
    <LoadingModal
        message="Loading Shadowdark Tools..."
        theme={{
            overlay: "absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity",
            container: "relative z-10 p-8 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-center space-y-4 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300",
            spinner: "w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto",
            text: "text-xl font-bold text-white font-sans"
        }}
    />
);

const uiManifest: UIModuleManifest = {
    info,
    sheet: React.lazy(() => import('../src/ui/ShadowdarkSheet')),
    rollModal: React.lazy(() => import('../src/ui/components/ShadowdarkInitiativeModal')),
    tools: {
        'generator': React.lazy(() => import('../src/ui/tools/Generator'))
    },
    dashboardTools: React.lazy(() => import('../src/ui/ShadowdarkDashboardTools')),
    dashboardLoading: ShadowdarkLoading,
    actorPage: React.lazy(() => import('../src/ui/pages/ActorPage'))
};

export default uiManifest;
