import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { MorkBorgAdapter } from './adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: MorkBorgAdapter,
    sheet: React.lazy(() => import('./ui/MorkBorgSheet')),
    actorPage: React.lazy(() => import('./ui/pages/ActorPage')),
    tools: {
        generator: React.lazy(() => import('./ui/dashboard/MorkBorgCharacterGenerator'))
    }
};

export default manifest;
