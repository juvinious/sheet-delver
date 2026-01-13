import { FoundryClient } from './client';

// Augment the global scope to include our client
declare global {
    var _foundryClient: FoundryClient | undefined;
}

export function getClient(): FoundryClient | undefined {
    return global._foundryClient;
}

export function setClient(client: FoundryClient) {
    global._foundryClient = client;
}
