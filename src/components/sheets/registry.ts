import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// Define the Registry Type
type SheetRegistry = Record<string, ComponentType<any>>;

export const SYSTEM_REGISTRY: SheetRegistry = {
    'shadowdark': dynamic(() => import('./ShadowdarkSheet'), {
        loading: () => null,
        ssr: false
    }),
    'morkborg': dynamic(() => import('./MorkBorgSheet'), {
        loading: () => null,
        ssr: false
    }),
};
