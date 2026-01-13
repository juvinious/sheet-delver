import { SystemAdapter } from './types';
import { GenericSystemAdapter } from './generic';
import { DnD5eAdapter } from './dnd5e';
import { ShadowdarkAdapter } from './shadowdark';

export function getAdapter(systemId: string): SystemAdapter {
    switch (systemId) {
        case 'dnd5e':
            return new DnD5eAdapter();
        case 'shadowdark':
            return new ShadowdarkAdapter();
        default:
            return new GenericSystemAdapter();
    }
}
