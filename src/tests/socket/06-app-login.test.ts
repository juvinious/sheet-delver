
import { ClientSocket } from '@core/foundry/sockets/ClientSocket';
import { CoreSocket } from '@core/foundry/sockets/CoreSocket';
import { loadConfig } from '@core/config';

/**
 * Test 6: Application Login Flow
 * Tests the client.login() method which handles re-authentication
 */
export async function testAppLogin() {
    logger.info('🧪 Test 6: Application Login Flow\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }
    const core = new CoreSocket(config.foundry);
    const client = new ClientSocket(config.foundry, core);
    const results: any = { tests: [] };

    try {
        // 1. Initial Connection
        await core.connect();
        logger.info('✅ Core Connected\n');
        logger.info('6a. Establishing initial connection...');
        await client.connect();

        if (client.isConnected) {
            logger.info('   ✅ Initial connection successful');
            results.tests.push({ name: 'initial-connect', success: true });
        } else {
            throw new Error('Initial connection failed');
        }

        // 2. Perform Re-Login
        // We use the same credentials to verify the mechanism works
        // In a real scenario, this would swich to a new user.
        logger.info('\n6b. Testing client.login() (Re-authentication)...');
        const { username, password } = config.foundry;

        // This should disconnect and reconnect
        await client.login(username, password);

        if (client.isConnected) {
            logger.info(`   ✅ Re-login as "${username}" successful`);
            results.tests.push({ name: 're-login', success: true });
        } else {
            throw new Error('Re-login failed');
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
        await core.disconnect();
        logger.info('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testAppLogin().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
