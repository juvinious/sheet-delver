import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { ShadowdarkAdapter } from './adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: ShadowdarkAdapter,
    sheet: React.lazy(() => import('./ui/ShadowdarkSheet')),
    tools: {
        'generator': React.lazy(() => import('./ui/tools/Generator'))
    }
};

export default manifest;
