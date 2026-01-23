import { FoundryClient } from './client';

// Augment the global scope to include our client
declare global {
    var _foundryClient: FoundryClient | undefined;
}

export function getClient(): FoundryClient | undefined {
    // [Dev Fix] Check for stale instance (missing new methods)
    if (global._foundryClient && typeof (global._foundryClient as any).useItem !== 'function') {
        // Discard stale instance silently or with generic log if absolutely needed, but user requested clean log
        global._foundryClient = undefined;
    }
    return global._foundryClient;
}

export function setClient(client: FoundryClient) {
    global._foundryClient = client;
}
