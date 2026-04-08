import React from 'react';
import { UIModuleManifest } from '@modules/registry/types';
import info from '../info.json';

const uiManifest: UIModuleManifest = {
    info,
    // Fallback to generic sheet for now as we haven't implemented a specific one
    sheet: () => import('../../generic/module/ui').then(module => {
        const gen = (module.default || module) as UIModuleManifest;
        return (gen.sheet as Function)();
    }),
    actorPage: () => import('../../generic/module/ui').then(module => {
        const gen = (module.default || module) as UIModuleManifest;
        return (gen.actorPage as Function)();
    })
};

export default uiManifest;
