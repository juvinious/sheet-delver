import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { MorkBorgAdapter } from './lib/foundry/adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: MorkBorgAdapter,
    sheet: React.lazy(() => import('./components/sheets/MorkBorgSheet'))
};

export default manifest;
