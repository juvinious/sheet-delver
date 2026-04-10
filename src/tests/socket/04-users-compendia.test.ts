import { CoreSocket } from '@core/foundry/sockets/CoreSocket';
import { loadConfig } from '@core/config';

/**
 * Test 4: User and Compendium Data
 * Tests user list and compendium access
 */
export async function testUsersAndCompendia() {
    logger.info('🧪 Test 4: Users & Compendium Data\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new CoreSocket(config.foundry);
    const results: any = { tests: [] };

    try {
        await client.connect();
        logger.info('✅ Connected\n');

        // Test 4a: getUsers()
        logger.info('4a. Testing getUsers()...');
        try {
            const users = await client.getUsers();
            logger.info(`   ✅ Found ${users.length} users`);
            users.forEach((u: any) => {
                logger.info(`      - ${u.name}: Role ${u.role} (${typeof u.role})`);
            });
            results.tests.push({ name: 'getUsers', success: true, data: { count: users.length } });
        } catch (error: any) {
            logger.info(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getUsers', success: false, error: error.message });
        }

        // Test 4b: getUsersDetails()
        logger.info('\n4b. Testing getUsersDetails()...');
        try {
            await client.getGameData()['users'];
            logger.info(`   ✅ Retrieved detailed user info`);
            results.tests.push({ name: 'getUsersDetails', success: true });
        } catch (error: any) {
            logger.info(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getUsersDetails', success: false, error: error.message });
        }

        // Test 4c: getAllCompendiumIndices()
        logger.info('\n4c. Testing getAllCompendiumIndices()...');
        try {
            const indices = await client.getAllCompendiumIndices();
            logger.info(`   ✅ Found ${indices.length} compendium packs`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: true, data: { count: indices.length } });
        } catch (error: any) {
            logger.info(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: false, error: error.message });
        }

        const successCount = results.tests.filter((t: any) => t.success).length;
        results.success = successCount === results.tests.length;

        logger.info(`\n📊 ${successCount}/${results.tests.length} tests passed`);
        return results;

    } catch (error: any) {
        logger.error('❌ Test suite failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        logger.info('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';
import { logger } from '@shared/utils/logger';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testUsersAndCompendia().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
