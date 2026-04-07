import React from 'react';
import { UIModuleManifest } from '@/modules/registry';
import info from '../info.json';

const uiManifest: UIModuleManifest = {
    info,
    sheet: React.lazy(() => import('../src/ui/GenericSheet')),
    actorPage: React.lazy(() => import('../src/ui/pages/ActorPage'))
};

export default uiManifest;
