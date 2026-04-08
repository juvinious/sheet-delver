import React from 'react';
import { UIModuleManifest } from '@modules/registry/types';
import info from '../info.json';

const uiManifest: UIModuleManifest = {
    info,
    sheet: () => import('../src/ui/GenericSheet'),
    actorPage: () => import('../src/ui/pages/ActorPage')
};

export default uiManifest;
