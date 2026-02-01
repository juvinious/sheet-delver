import { SocketFoundryClient } from '../../lib/foundry/SocketClient';
import { loadConfig } from '../../lib/config';

/**
 * Test 2: System Information Retrieval
 * Tests read-only system data access
 */
export async function testSystemInfo() {
    console.log('🧪 Test 2: System Information\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new SocketFoundryClient(config.foundry);
    const results: any = { tests: [] };

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // Test 2a: getSystem()
        console.log('2a. Testing getSystem()...');
        try {
            const system = await client.getSystem();
            console.log(`   ✅ System: ${system.id} v${system.version}`);
            results.tests.push({ name: 'getSystem', success: true, data: system });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getSystem', success: false, error: error.message });
        }

        // Test 2b: getSystemData()
        console.log('\n2b. Testing getSystemData()...');
        try {
            await client.getSystemData();
            console.log('   ✅ Retrieved system data\n');
            results.tests.push({ name: 'getSystemData', success: true });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getSystemData', success: false, error: error.message });
        }

        // Test 2c: evaluate() for world info
        console.log('\n2c. Testing evaluate() for world info...');
        try {
            // @ts-ignore
            const worldId = await client.evaluate(() => (game as any).world.id);
            // @ts-ignore
            const worldTitle = await client.evaluate(() => (game as any).world.title);
            console.log(`   ✅ World: ${worldTitle} (${worldId})`);
            results.tests.push({ name: 'evaluate-world', success: true, data: { worldId, worldTitle } });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'evaluate-world', success: false, error: error.message });
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
    testSystemInfo().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
