import { loadConfig } from '../src/lib/config.js';
import { createFoundryClient } from '../src/lib/foundry/index.js';
import { logger } from '../src/lib/logger.js';

console.log(">>> TEST SCRIPT STARTING <<<");

async function testHeadless() {
    const config = await loadConfig();
    if (!config) {
        console.error("Could not load config");
        return;
    }

    console.log(`--- Headless Connection Test ---`);
    console.log(`Provider: ${config.foundry.provider}`);
    console.log(`URL: ${config.foundry.url}`);
    console.log(`User: ${config.foundry.username}`);

    const client = createFoundryClient(config.foundry);

    try {
        console.log("Connecting...");
        await client.connect();
        console.log("✅ Successfully connected to Foundry via Sockets!");

        console.log("Fetching actors...");
        const actors = await client.getActors();
        console.log(`Found ${actors.length} actors.`);

        console.log("Fetching users...");
        const users = await client.getUsers();
        console.log(`Found ${users.length} users.`);

        if (actors.length > 0) {
            const firstActor = actors[0];
            console.log(`First actor: ${firstActor.name} (${firstActor.id || firstActor._id})`);

            console.log(`Fetching full actor data...`);
            const id = firstActor.id || firstActor._id;
            const fullActor = await client.getActor(id);
            console.log(`✅ Successfully retrieved and normalized actor: ${fullActor.name}`);
        }

    } catch (e: any) {
        console.error("❌ Connection failed!");
        console.error(e.message);
        if (e.stack) console.error(e.stack);
    } finally {
        // If we had a way to close the socket, we'd do it here
        process.exit(0);
    }
}

testHeadless();
