import { SocketFoundryClient } from '../../lib/foundry/SocketClient';
import { loadConfig } from '../../lib/config';

/**
 * Test 4: User and Compendium Data
 * Tests user list and compendium access
 */
export async function testUsersAndCompendia() {
    console.log('🧪 Test 4: Users & Compendium Data\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new SocketFoundryClient(config.foundry);
    const results: any = { tests: [] };

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // Test 4a: getUsers()
        console.log('4a. Testing getUsers()...');
        try {
            const users = await client.getUsers();
            console.log(`   ✅ Found ${users.length} users`);
            results.tests.push({ name: 'getUsers', success: true, data: { count: users.length } });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getUsers', success: false, error: error.message });
        }

        // Test 4b: getUsersDetails()
        console.log('\n4b. Testing getUsersDetails()...');
        try {
            await client.getUsersDetails();
            console.log(`   ✅ Retrieved detailed user info`);
            results.tests.push({ name: 'getUsersDetails', success: true });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getUsersDetails', success: false, error: error.message });
        }

        // Test 4c: getAllCompendiumIndices()
        console.log('\n4c. Testing getAllCompendiumIndices()...');
        try {
            const indices = await client.getAllCompendiumIndices();
            console.log(`   ✅ Found ${indices.length} compendium packs`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: true, data: { count: indices.length } });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: false, error: error.message });
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
    testUsersAndCompendia().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
