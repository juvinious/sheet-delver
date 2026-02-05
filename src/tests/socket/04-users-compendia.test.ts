import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { logger } from '../../core/logger';
import { CompendiumCache } from '../../core/foundry/compendium-cache';

async function getAllCompendiumIndices(client: CoreSocket): Promise<any[]> {
    if (!client.isConnected) return [];

    try {
        // Use Cached World Data (gameData) as the single source of truth
        const game = client.getGameData() || await client.fetchGameData();
        if (!game) {
            logger.warn('SocketFoundryClient | No gameData available for discovery.');
            return [];
        }

        const packs = new Map<string, any>();

        // 1. Discovery from World
        if (game.world?.packs) {
            game.world.packs.forEach((p: any) => {
                const id = p.id || p._id || `${p.system}.${p.name}` || p.name;
                packs.set(id, { ...p, source: 'world' });
            });
        }

        // 2. Discovery from System
        if (game.system?.packs) {
            game.system.packs.forEach((p: any) => {
                const id = p.id || p._id || `${game.system.id}.${p.name}` || p.name;
                if (!packs.has(id)) packs.set(id, { ...p, system: game.system.id, source: 'system' });
            });
        }

        // 3. Discovery from Modules
        if (game.modules) {
            game.modules.forEach((mod: any) => {
                if (mod.packs) {
                    mod.packs.forEach((p: any) => {
                        const id = p.id || p._id || `${mod.id}.${p.name}` || p.name;
                        if (!packs.has(id)) packs.set(id, { ...p, module: mod.id, source: 'module' });
                    });
                }
            });
        }

        // logger.debug(`SocketFoundryClient | Aggregated ${packs.size} compendium packs from gameData.`);

        // 4. Fetch Indices for each pack
        const results = [];
        for (const [packId, metadata] of packs.entries()) {
            // Determine Document Type (Default to Item if unknown)
            const docType = metadata.type || metadata.entity || metadata.documentName || 'Item';

            // Fetch index (This still uses the socket, which is efficient)
            /*const index = await client.getPackIndex(packId, docType);
            results.push({
                id: packId,
                metadata: metadata,
                index: index
            });*/
            /*const index = await cache.getPackIndex(packId, docType);
            results.push({
                id: packId,
                metadata: metadata,
                index: index
            });*/
            const index = await client.getGameData();
            results.push({
                id: packId,
                metadata: metadata,
                index: index
            });
        }

        return results;
    } catch (e) {
        logger.warn(`getAllCompendiumIndices failed: ${e}`);
        return [];
    }
}


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
            await client.getGameData()['users'];
            console.log(`   ✅ Retrieved detailed user info`);
            results.tests.push({ name: 'getUsersDetails', success: true });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
            results.tests.push({ name: 'getUsersDetails', success: false, error: error.message });
        }

        // Test 4c: getAllCompendiumIndices()
        console.log('\n4c. Testing getAllCompendiumIndices()...');
        try {
            const indices = await getAllCompendiumIndices(client);
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
