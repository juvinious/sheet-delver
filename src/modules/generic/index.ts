import React from 'react';
import { ModuleManifest } from '../core/interfaces';
import { GenericSystemAdapter } from './adapter'; // Keeping this import as it's not explicitly changed in the instruction's import section
import info from './info.json';

const manifest: ModuleManifest = {
    info,
    adapter: GenericSystemAdapter, // Reverting to original as GenericAdapter is not imported and would cause a syntax error
    sheet: React.lazy(() => import('./ui/GenericSheet')),
    actorPage: React.lazy(() => import('./ui/pages/ActorPage'))
};

export default manifest;
