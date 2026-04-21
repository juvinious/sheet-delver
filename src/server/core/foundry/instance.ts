import { FoundryClient } from './interfaces';

// Augment the global scope to include our client
declare global {
    var _foundryClient: FoundryClient | undefined;
}

function hasDrawMethod(client: FoundryClient): boolean {
    const draw = Reflect.get(client as object, 'draw');
    return typeof draw === 'function';
}

export function getClient(): FoundryClient | undefined {
    // [Dev Fix] Check for stale instance (missing new methods)
    if (global._foundryClient && !hasDrawMethod(global._foundryClient)) {
        // Discard stale instance to ensure HMR picks up the new CoreSocket prototype
        global._foundryClient = undefined;
    }
    return global._foundryClient;
}

export function setClient(client: FoundryClient) {
    global._foundryClient = client;
}
