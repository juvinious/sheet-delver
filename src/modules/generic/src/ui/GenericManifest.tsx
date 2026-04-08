import React from 'react';
import { UIModuleManifest } from '@modules/registry/types';
import info from '../../info.json';

const uiManifest: UIModuleManifest = {
    info,
    sheet: React.lazy(() => import('./GenericSheet')),
    actorPage: React.lazy(() => import('./pages/ActorPage'))
};

export default uiManifest;
