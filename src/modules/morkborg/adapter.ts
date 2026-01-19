import { GenericSystemAdapter } from '../generic/adapter';

export class MorkBorgAdapter extends GenericSystemAdapter {
    systemId = 'morkborg';

    match(actor: any): boolean {
        return actor.systemId === 'morkborg' || !!actor.system?.omens || !!actor.system?.miseries || (actor.id === 'kwBs8lhMY58BLYFt' || actor.id === 'IbsumID');
    }

    // Override modify/normalize if specific logic is needed later
    // For now, it behaves exactly like Generic but allows clean separation
}
