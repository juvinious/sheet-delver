import { FoundryConfig } from './types';
import { FoundryClient } from './interfaces';
import { SocketFoundryClient } from './SocketClient';

export function createFoundryClient(config: FoundryConfig): FoundryClient {
    return new SocketFoundryClient(config);
}

// Export individual clients and interface for flexibility
export { SocketFoundryClient };
export type { FoundryClient };


