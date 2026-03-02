import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { ShadowdarkAdapter } from './system';
export { ShadowdarkAdapter };
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: ShadowdarkAdapter,
    sheet: React.lazy(() => import('./ui/ShadowdarkSheet')),
    rollModal: React.lazy(() => import('./ui/components/ShadowdarkInitiativeModal')),
    tools: {
        'generator': React.lazy(() => import('./ui/tools/Generator'))
    },
    actorPage: React.lazy(() => import('./ui/pages/ActorPage'))
};

export default manifest;
