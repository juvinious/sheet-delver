import { SocketFoundryClient } from '../../lib/foundry/SocketClient';
import { loadConfig } from '../../lib/config';

/**
 * Test 3: Actor Data Access
 * Tests reading actor data from the world
 */
export async function testActorAccess() {
    console.log('🧪 Test 3: Actor Data Access\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new SocketFoundryClient(config.foundry);
    const results: any = { tests: [] };

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // Test 3a: getActors()
        console.log('3a. Testing getActors()...');
        try {
            const actors = await client.getActors();
            console.log(`   ✅ Found ${actors.length} actors`);
            if (actors.length > 0) {
                console.log(`   First actor: ${actors[0].name} (${actors[0]._id})`);
            }
            results.tests.push({ name: 'getActors', success: true, data: { count: actors.length } });
            results.actors = actors;
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getActors', success: false, error: error.message });
            results.actors = [];
        }

        // Test 3b: getActor(id) - only if we have actors
        if (results.actors.length > 0) {
            const testActorId = results.actors[0]._id;
            console.log(`\n3b. Testing getActor('${testActorId}')...`);
            try {
                const actor = await client.getActor(testActorId);
                console.log(`   ✅ Retrieved: ${actor.name}`);
                console.log(`   Type: ${actor.type}`);
                results.tests.push({ name: 'getActor', success: true, data: { name: actor.name, type: actor.type } });
            } catch (error: any) {
                console.log(`   ❌ Failed: ${error.message}`);
                results.tests.push({ name: 'getActor', success: false, error: error.message });
            }
        } else {
            console.log('\n3b. Skipping getActor() - no actors available');
        }

        const successCount = results.tests.filter((t: any) => t.success).length;
        results.success = successCount === results.tests.length;

        console.log(`\n📊 ${successCount}/${results.tests.length} tests passed`);
        return results;

    } catch (error: any) {
        console.error('❌ Test suite failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        console.log('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testActorAccess().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
