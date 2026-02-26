import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import * as fs from 'fs';

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

    const client = new CoreSocket(config.foundry);
    const results: any = { tests: [] };

    try {
        await client.connect();
        console.log('✅ Connected\n');

        const system = await client.getSystem();
        // Output system id
        console.log(`   ✅ System ID: ${system.id}`);

        let indices = [];

        // Test 4c: getAllCompendiumIndices()
        console.log('\n4a. Testing getAllCompendiumIndices()...');
        try {
            indices = await client.getAllCompendiumIndices(true);
            console.log(`   ✅ Found ${indices.length} compendium packs`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: true, data: { count: indices.length } });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: false, error: error.message });
        }

        const successCount = results.tests.filter((t: any) => t.success).length;
        results.success = successCount === results.tests.length;

        if (indices.length === 0) {
            console.log(`   ❌ No compendium packs found`);
            results.tests.push({ name: 'getAllCompendiumIndices', success: false, error: 'No compendium packs found' });
        }

        // Create directory in temp/systemid
        const dir = `temp/${system.id}`;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Output Compedium content
        for (const index of indices) {
            // console.log(`Data: ` + JSON.stringify(index, null, 2));
            console.log(`   ✅ Found ${index.id} compendium pack`);
            const docType = index.metadata?.type || index.metadata?.entity || 'Item';
            const items = await client.getPackDocuments(index.id, docType);
            console.log(`   ✅ Fetched ${items.length} full documents from ${index.metadata?.name || index.id}`);
            // console.log(`Data: ` + JSON.stringify(index, null, 2));
            // Output items to file, overwrite if exists
            fs.writeFileSync(`${dir}/${index.id}.json`, JSON.stringify(items, null, 2));
        }

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
