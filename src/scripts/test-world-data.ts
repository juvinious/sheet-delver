
import { loadConfig } from '../src/lib/config';
import { SocketFoundryClient } from '../src/lib/foundry/SocketClient';

async function testWorldData() {
    const config = await loadConfig();
    if (!config) {
        console.error("No config found");
        return;
    }

    const client = new SocketFoundryClient(config.foundry);
    await client.connect();

    console.log("Connected. Probing for World Data...");

    try {
        // Try fetching 'core.world' setting (if it exists)
        // Usually 'core.world' might actally be the world name, not the title.
        console.log("1. Fetching 'core.world' setting...");
        // @ts-ignore
        const worldSetting = await client.dispatchDocumentSocket('Setting', 'get', {
            query: { key: 'core.world' },
            broadcast: false
        });
        console.log("   Result:", JSON.stringify(worldSetting, null, 2));

    } catch (e: any) {
        console.log("   Error:", e.message);
    }

    try {
        // Try fetching 'World' document directly (might not work if not exposed)
        console.log("\n2. Fetching 'World' document...");
        // @ts-ignore
        const worlds = await client.dispatchDocumentSocket('World', 'get', {
            broadcast: false
        });
        console.log("   Result:", JSON.stringify(worlds, null, 2));
    } catch (e: any) {
        console.log("   Error:", e.message);
    }

    try {
        // Try fetching 'Setting' for world title? 
        // Foundry stores world configs in 'setup.json' usually, but maybe 'core.worldConfig' setting?
        console.log("\n3. Fetching 'core.worldConfig' setting...");
        // @ts-ignore
        const worldConfig = await client.dispatchDocumentSocket('Setting', 'get', {
            query: { key: 'core.worldConfig' },
            broadcast: false
        });
        console.log("   Result:", JSON.stringify(worldConfig, null, 2));
    } catch (e: any) {
        console.log("   Error:", e.message);
    }

    // Try fetching ALL settings to see what we have
    /*
    try {
        console.log("\n4. Fetching ALL Settings (limit 20)...");
        // @ts-ignore
        const allSettings = await client.dispatchDocumentSocket('Setting', 'get', {
            broadcast: false
        });
        if (allSettings && allSettings.result) {
            console.log("   Keys found:", allSettings.result.slice(0, 20).map((s: any) => s.key));
        }
    } catch(e: any) {
        console.log("   Error:", e.message);
    }
    */

    client.disconnect();
}

testWorldData();
