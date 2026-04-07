import React from 'react';
import { UIModuleManifest } from '@modules/registry';
import info from '../info.json';

const uiManifest: UIModuleManifest = {
    info,
    // Fallback to generic sheet for now as we haven't implemented a specific one
    sheet: React.lazy(() => import('../../generic/module/ui').then(module => ({ default: module.default.sheet as any }))),
    actorPage: React.lazy(() => import('../../generic/module/ui').then(module => ({ default: module.default.actorPage as any })))
};

export default uiManifest;
