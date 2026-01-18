import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { DnD5eAdapter } from './adapter';
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: DnD5eAdapter,
    // Fallback to generic sheet for now as we haven't implemented a specific one
    sheet: React.lazy(() => import('../generic/ui/GenericSheet'))
};

export default manifest;
