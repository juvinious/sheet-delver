import { FoundryConfig } from './types';
import { FoundryClient } from './interfaces';
import { SocketFoundryClient } from './SocketClient';

export function createFoundryClient(config: FoundryConfig): FoundryClient {
    const connector = config.connector || 'socket';

    if (connector === 'socket') {
        return new SocketFoundryClient(config);
    }

    // Future connectors (e.g. 'api') can be added here
    // Verify that we are not trying to use removed connectors
    if (connector === 'playwright' || connector === 'bridge') {
        throw new Error(`Connector '${connector}' is deprecated. Please use 'socket'.`);
    }

    // Default fallback
    return new SocketFoundryClient(config);
}

// Export individual clients and interface for flexibility
export { SocketFoundryClient };
export type { FoundryClient };


