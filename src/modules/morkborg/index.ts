import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { MorkBorgAdapter } from './adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: MorkBorgAdapter,
    sheet: React.lazy(() => import('./ui/MorkBorgSheet'))
};

export default manifest;
