import { FoundryConfig } from './types';
import { FoundryClient } from './interfaces';
import { ClientSocket } from './sockets/ClientSocket';
import { CoreSocket } from './sockets/CoreSocket';

export function createFoundryClient(config: FoundryConfig): FoundryClient {
    // Default to User Client, but requires Core
    const core = new CoreSocket(config);
    // Note: CoreSocket needs connect() to be useful, but factory just returns instance
    return new ClientSocket(config, core) as any;
}

// Export individual clients and interface for flexibility
export { ClientSocket, CoreSocket };
export type { FoundryClient };


