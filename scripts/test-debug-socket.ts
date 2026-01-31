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

        // Test 1: Read (Actors)
        console.log("Testing Read Actors...");
        try {
            const actors = await client.getActors();
            // const actors: any[] = [];
            console.log(`✅ Found ${actors.length} actors.`);

            if (actors.length > 0) {
                const actor = actors[0];
                console.log(`First Actor: ${actor.name}`);

                // Test 2: Update Actor (Harmless flag) - DISABLED (Testing Read-Only Stability)
                // console.log(`Testing Update on Actor: ${actor.name}`);
                // await client.updateActor(actor.id || actor._id, { "flags.world.test": Date.now() });
                // console.log("✅ Updated actor flag.");
            }
        } catch (readErr: any) {
            console.error("❌ Read Actors failed:", readErr);
        }

        // Test 3: Chat (Write) - DISABLED (Suspected Server Breaker)
        // console.log("Testing Chat...");
        // await client.sendMessage("Hello from headless Socket Client!");
        // console.log("✅ Sent chat message.");

        // Test 4: Roll - DISABLED
        // console.log("Testing Roll...");
        // await client.roll("1d20 + 5", "Test Roll");
        // console.log("✅ Sent roll.");

        console.log("Waiting 15s to allow server session to stabilize...");
        await new Promise(r => setTimeout(r, 15000));

    } catch (e: any) {
        console.error("Test failed:", e);
    } finally {
        client.disconnect();
        process.exit(0);
    }
}

debugSocket();
