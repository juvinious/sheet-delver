import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { ShadowdarkAdapter } from './lib/foundry/adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: ShadowdarkAdapter,
    sheet: React.lazy(() => import('./components/sheets/ShadowdarkSheet'))
};

export default manifest;
