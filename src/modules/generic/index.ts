import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { GenericSystemAdapter } from './lib/foundry/adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: GenericSystemAdapter,
    sheet: React.lazy(() => import('./components/sheets/GenericSheet'))
};

export default manifest;
