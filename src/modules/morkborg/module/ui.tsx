import React from 'react';
import { UIModuleManifest } from '@/modules/registry';
import info from '../info.json';

const uiManifest: UIModuleManifest = {
    info,
    sheet: React.lazy(() => import('../src/ui/MorkBorgSheet')),
    actorPage: React.lazy(() => import('../src/ui/pages/ActorPage')),
    tools: {
        'generator': React.lazy(() => import('../src/ui/dashboard/MorkBorgCharacterGenerator'))
    },
    dashboardTools: React.lazy(() => import('../src/ui/dashboard/MorkBorgDashboardTools')),
};

export default uiManifest;
