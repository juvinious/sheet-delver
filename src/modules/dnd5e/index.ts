import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { DnD5eAdapter } from './lib/foundry/adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: DnD5eAdapter,
    // Fallback to generic sheet for now as we haven't implemented a specific one
    sheet: React.lazy(() => import('../generic/components/sheets/GenericSheet'))
};

export default manifest;
