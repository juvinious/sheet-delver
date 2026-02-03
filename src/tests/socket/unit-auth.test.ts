import { SocketFoundryClient } from '../../core/foundry/SocketClient';
import { FoundryConfig } from '../../core/foundry/types';
import { EventEmitter } from 'events';

// Mock Socket.io Client
class MockSocket extends EventEmitter {
    id = 'mock-socket-id';
    io = { opts: { query: {} } };
    connected = true;
    disconnect() { this.emit('disconnect'); }
    connect() { this.emit('connect'); }
}

class TestClient extends SocketFoundryClient {
    public mockSocket: MockSocket;

    constructor(config: FoundryConfig) {
        super(config);
        this.mockSocket = new MockSocket();
        // @ts-ignore
        this.socket = this.mockSocket;
        this.isSocketConnected = true; // Simulate connected state
    }

    public triggerSessionEvent(userId: string | null) {
        // Find the 'session' listener registered in connect()
        // Since we can't easily grab the real listener, we'll simulate the effect directly
        // by calling the internal logic if strictly unit testing, 
        // OR we just use the public properties to verify logic if we could trigger the handler.

        // Actually, we can't trigger the private handler easily without re-implementing connect().
        // BUT, we changed the getter. 
        // The getter relies on `this.userId`.
        // So let's just set `this.userId` and verify the getter.

        this.userId = userId;
    }
}

async function run() {
    const config: FoundryConfig = { url: 'http://test', username: 'user', password: 'pw' };
    const client = new TestClient(config);

    console.log('--- Auth Logic Test ---');

    // 1. Initial State
    console.log(`Initial isLoggedIn: ${client.isLoggedIn} (Expected: false)`);
    if (client.isLoggedIn !== false) throw new Error('Initial state wrong');

    // 2. Simulate Explicit Session (Login)
    client.isExplicitSession = true;
    console.log(`Explicit isLoggedIn: ${client.isLoggedIn} (Expected: true)`);
    if (client.isLoggedIn !== true) throw new Error('Explicit session state wrong');

    // 3. Simulate Reset (Disconnect/Refresh)
    client.isExplicitSession = false;
    client.userId = null;
    console.log(`Reset isLoggedIn: ${client.isLoggedIn} (Expected: false)`);
    if (client.isLoggedIn !== false) throw new Error('Reset state wrong');

    // 4. Simulate Socket Session Event (Restored Session)
    client.userId = 'mock-user-id';
    console.log(`Restored Session isLoggedIn: ${client.isLoggedIn} (Expected: true)`);
    if (client.isLoggedIn !== true) throw new Error('Restored session state wrong [FIX VERIFIED]');

    // 5. Simulate Guest Session
    client.userId = null;
    console.log(`Guest Session isLoggedIn: ${client.isLoggedIn} (Expected: false)`);
    if (client.isLoggedIn !== false) throw new Error('Guest session state wrong');

    console.log('\n✅ All Auth Logic Tests Passed');
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
