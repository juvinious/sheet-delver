import { SocketFoundryClient } from '../../core/foundry/SocketClient';
import { loadConfig } from '../../core/config';

/**
 * Test 5: Write Operations (Safe CRUD)
 * Tests creating, updating, and deleting a temporary actor to verify write capabilities.
 */
export async function testWriteOperations() {
    console.log('🧪 Test 5: Write Operations (Safe CRUD)\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new SocketFoundryClient(config.foundry);
    const results: any = { tests: [] };
    let tempActorId: string | null = null;
    let tempItemId: string | null = null;

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // Test 5a: Create Temporary Actor
        console.log('5a. Creating temporary actor...');
        try {
            const actorData = {
                name: "TEMP_TEST_ACTOR_" + Date.now(),
                type: "NPC", // Assuming generic system or Shadowdark NPC
                img: "icons/svg/mystery-man.svg"
            };
            const createdActor = await client.createActor(actorData);
            tempActorId = createdActor._id;
            console.log(`   ✅ Created actor: ${createdActor.name} (${tempActorId})`);
            results.tests.push({ name: 'createActor', success: true, data: { id: tempActorId } });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'createActor', success: false, error: error.message });
            // Cannot proceed if creation failed
            throw new Error("Generic CRUD test aborted due to creation failure");
        }

        // Test 5b: Update Actor
        if (tempActorId) {
            console.log('\n5b. Updating temporary actor...');
            try {
                const updateData = {
                    name: "UPDATED_TEST_ACTOR_" + Date.now(),
                    "system.details.biography": "<p>Updated via socket test</p>"
                };
                await client.updateActor(tempActorId, updateData);

                // Verify update
                const updatedActor = await client.getActor(tempActorId);
                if (updatedActor.name.startsWith("UPDATED_TEST_ACTOR")) {
                    console.log(`   ✅ Updated actor name to: ${updatedActor.name}`);
                    results.tests.push({ name: 'updateActor', success: true });
                } else {
                    throw new Error("Update checks failed - name did not change");
                }
            } catch (error: any) {
                console.log(`   ❌ Failed: ${error.message}`);
                results.tests.push({ name: 'updateActor', success: false, error: error.message });
            }
        }

        // Test 5c: Create Item on Actor
        if (tempActorId) {
            console.log('\n5c. Creating item on actor...');
            try {
                const itemData = {
                    name: "Test Item",
                    type: "Basic", // Shadowdark specific type
                    img: "icons/svg/item-bag.svg"
                };
                // Note: Shadowdark specific types might be 'Basic', 'Weapon' etc. 
                // Using 'Item' as a broad guess, or we can try to inspect system types if we had them.
                // Let's try to be generic.

                tempItemId = await client.createActorItem(tempActorId, itemData);
                console.log(`   ✅ Created item: ${tempItemId}`);
                results.tests.push({ name: 'createActorItem', success: true, data: { id: tempItemId } });
            } catch (error: any) {
                // Some systems are strict about Item Types. 
                // If this fails, it might be due to invalid type 'Item'.
                console.log(`   ❌ Failed (Type might be invalid for system): ${error.message}`);
                results.tests.push({ name: 'createActorItem', success: false, error: error.message });
            }
        }

        // Test 5d: Chat Message
        console.log('\n5d. Sending test chat message...');
        try {
            await client.sendMessage("🧪 Socket Test: Write Operations Verified");
            console.log(`   ✅ Sent chat message`);
            results.tests.push({ name: 'sendMessage', success: true });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'sendMessage', success: false, error: error.message });
        }

        const successCount = results.tests.filter((t: any) => t.success).length;
        results.success = successCount === results.tests.length;

        console.log(`\n📊 ${successCount}/${results.tests.length} tests passed`);
        return results;

    } catch (error: any) {
        console.error('❌ Test suite failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        // CLEANUP: Always delete the temporary actor
        if (tempActorId) {
            console.log('\n🧹 Cleaning up: Deleting temporary actor...');
            try {
                await client.deleteActor(tempActorId);
                console.log('   ✅ cleanup successful');
            } catch (cleanupError: any) {
                console.error(`   ⚠️ Cleanup failed: ${cleanupError.message}. Please manually delete actor ${tempActorId}`);
            }
        }
        await client.disconnect();
        console.log('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testWriteOperations().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
