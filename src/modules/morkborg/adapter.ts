import { GenericSystemAdapter } from '../generic/adapter';

export class MorkBorgAdapter extends GenericSystemAdapter {
    systemId = 'morkborg';

    // Override modify/normalize if specific logic is needed later
    // For now, it behaves exactly like Generic but allows clean separation
}
