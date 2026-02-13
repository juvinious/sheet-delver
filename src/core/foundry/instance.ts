import { FoundryClient } from './interfaces';

// Augment the global scope to include our client
declare global {
    var _foundryClient: FoundryClient | undefined;
}

export function getClient(): FoundryClient | undefined {
    // [Dev Fix] Check for stale instance (missing new methods)
    if (global._foundryClient && typeof (global._foundryClient as any).draw !== 'function') {
        // Discard stale instance to ensure HMR picks up the new CoreSocket prototype
        global._foundryClient = undefined;
    }
    return global._foundryClient;
}

export function setClient(client: FoundryClient) {
    global._foundryClient = client;
}
