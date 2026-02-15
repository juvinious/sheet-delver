import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';

/**
 * Test 10: Batch Operations
 * Verifies that CoreSocket can handle both single and multiple document creations reliably.
 */
export async function testBatchOperations() {
    console.log('🧪 Test 10: Batch Operations\n');

    const config = await loadConfig();
    if (!config) throw new Error("Config not loaded");
    const client = new CoreSocket(config.foundry);
    let tempActorId: string | null = null;
    let tempActorIds: string[] = [];

    try {
        await client.connect();

        // 1. Single Actor Creation
        console.log('1. Testing Single Actor Creation...');
        const singleActor = await client.createActor({
            name: "Single Test Actor " + Date.now(),
            type: "NPC"
        });
        if (!singleActor || !singleActor._id) throw new Error("Single actor creation failed");
        tempActorId = singleActor._id;
        console.log(`   ✅ Success: ${singleActor._id}`);

        // 2. Single Item Creation
        console.log('\n2. Testing Single Item Creation on Actor...');
        const itemId = await client.createActorItem(tempActorId!, {
            name: "Single Item",
            type: "Basic"
        });
        if (!itemId) throw new Error("Single item creation failed");
        console.log(`   ✅ Success: ${itemId}`);

        // 3. Batch Item Creation (The culprit for the reported bug)
        console.log('\n3. Testing Batch Item Creation (Array)...');
        const items = [
            { name: "Batch Item 1", type: "Basic" },
            { name: "Batch Item 2", type: "Basic" }
        ];
        const itemResults = await client.createActorItem(tempActorId!, items);
        if (!Array.isArray(itemResults) || itemResults.length !== 2) {
            throw new Error(`Batch item creation failed. Expected 2 results, got: ${JSON.stringify(itemResults)}`);
        }
        console.log(`   ✅ Success: Created ${itemResults.length} items`);

        // 4. Batch Actor Creation
        console.log('\n4. Testing Batch Actor Creation...');
        const actors = [
            { name: "Batch Actor 1", type: "NPC" },
            { name: "Batch Actor 2", type: "NPC" }
        ];
        const actorResults = await client.createActor(actors);
        if (!Array.isArray(actorResults) || actorResults.length !== 2) {
            throw new Error(`Batch actor creation failed. Expected 2 results, got: ${JSON.stringify(actorResults)}`);
        }
        tempActorIds = actorResults.map((a: any) => a._id);
        console.log(`   ✅ Success: Created ${actorResults.length} actors`);

        console.log('\n🎉 All Batch Operation Tests Passed!');
        return { success: true };

    } catch (e: any) {
        console.error(`\n❌ Batch Test Failed: ${e.message}`);
        return { success: false, error: e.message };
    } finally {
        console.log('\n🧹 Cleaning up...');
        if (tempActorId) await client.deleteActor(tempActorId).catch(() => { });
        for (const id of tempActorIds) {
            if (id) await client.deleteActor(id).catch(() => { });
        }
        await client.disconnect();
    }
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testBatchOperations().then(_res => process.exit(_res.success ? 0 : 1));
}
