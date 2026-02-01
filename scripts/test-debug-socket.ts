import { loadConfig } from '../src/lib/config.ts';
import { SocketFoundryClient } from '../src/lib/foundry/SocketClient.ts';
import { logger } from '../src/lib/logger.ts';

async function debugSocket() {
    const config = await loadConfig();
    if (!config) return;

    // Force Socket Client
    const client = new SocketFoundryClient(config.foundry);

    try {
        console.log("Connecting...");
        await client.connect();
        console.log("✅ Connected!");

        // Manual handshake fix test - DISABLED to prevent server breakage
        // console.log("Emitting clientReady manually...");
        // // @ts-ignore
        // if (client.socket) client.socket.emit('clientReady');
        await new Promise(r => setTimeout(r, 1000));

        // Test 1: Read (Actors) - DISABLED until authentication works
        // console.log("Testing Read Actors...");
        // try {
        //     const actors = await client.getActors();
        //     console.log(`✅ Found ${actors.length} actors.`);

        //     if (actors.length > 0) {
        //         const actor = actors[0];
        //         console.log(`First Actor: ${actor.name}`);
        //     }
        // } catch (readErr: any) {
        //     console.error("❌ Read Actors failed:", readErr);
        // }

        // Test 3: Chat (Write) - DISABLED (Suspected Server Breaker)
        // console.log("Testing Chat...");
        // await client.sendMessage("Hello from headless Socket Client!");
        // console.log("✅ Sent chat message.");

        // Test 4: Roll - DISABLED
        // console.log("Testing Roll...");
        // await client.roll("1d20 + 5", "Test Roll");
        // console.log("✅ Sent roll.");

        console.log("Waiting 2s to simulate session...");
        await new Promise(r => setTimeout(r, 2000));

    } catch (e: any) {
        console.error("Test failed:", e);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

debugSocket();
