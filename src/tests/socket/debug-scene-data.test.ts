import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';

/**
 * Debug Test: Scene Data Capture
 * Tests scene data retrieval and outputs captured data for debugging
 */
export async function testSceneData() {
    console.log('🧪 Debug Test: Scene Data Capture\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new CoreSocket(config.foundry);
    const results: any = { tests: [] };

    try {
        console.log('Connecting to Foundry...');
        await client.connect();
        console.log('✅ Connected\n');

        // Test 1: Check if sceneDataCache is populated
        console.log('1. Checking sceneDataCache...');
        const sceneData = client.getSceneData();

        if (sceneData) {
            console.log('✅ Scene data cached!');
            console.log(`   Type: ${typeof sceneData}`);
            console.log(`   Keys: ${Object.keys(sceneData).length}`);

            // List all scene IDs
            const sceneIds = Object.keys(sceneData);
            console.log(`\n   Scene IDs found: ${sceneIds.join(', ')}`);

            // Check for NUEDEFAULTSCENE0
            if (sceneData.NUEDEFAULTSCENE0) {
                console.log('\n✅ NUEDEFAULTSCENE0 found!');
                const defaultScene = sceneData.NUEDEFAULTSCENE0;
                console.log(`   Name: ${defaultScene.name}`);
                console.log(`   Background: ${defaultScene.background?.src || 'null'}`);

                results.tests.push({
                    name: 'default-scene',
                    success: true,
                    data: {
                        name: defaultScene.name,
                        backgroundSrc: defaultScene.background?.src
                    }
                });
            } else {
                console.log('\n❌ NUEDEFAULTSCENE0 not found in scene data');
                results.tests.push({
                    name: 'default-scene',
                    success: false,
                    error: 'NUEDEFAULTSCENE0 not found',
                    availableScenes: sceneIds
                });
            }

            // Output full scene data for debugging
            console.log('\n📋 Full Scene Data:');
            console.log(JSON.stringify(sceneData, null, 2));

        } else {
            console.log('❌ Scene data is null/undefined');
            console.log('   This means fetchSceneData() failed or returned null');
            results.tests.push({
                name: 'scene-data-cache',
                success: false,
                error: 'sceneDataCache is null'
            });
        }

        // Test 2: Try fetching scene data directly via socket
        console.log('\n\n2. Testing direct socket scene fetch...');
        try {
            // @ts-ignore - accessing private method for debugging
            const directSceneData = await client.fetchSceneData();

            if (directSceneData) {
                console.log('✅ Direct fetch succeeded!');
                console.log(`   Type: ${typeof directSceneData}`);
                console.log(`   Keys: ${Object.keys(directSceneData).length}`);
                console.log('\n📋 Direct Fetch Data:');
                console.log(JSON.stringify(directSceneData, null, 2));

                results.tests.push({
                    name: 'direct-fetch',
                    success: true
                });
            } else {
                console.log('❌ Direct fetch returned null');
                console.log('   The socket.emit("scene") call is not returning data');
                results.tests.push({
                    name: 'direct-fetch',
                    success: false,
                    error: 'fetchSceneData returned null'
                });
            }
        } catch (error: any) {
            console.log(`❌ Direct fetch failed: ${error.message}`);
            results.tests.push({
                name: 'direct-fetch',
                success: false,
                error: error.message
            });
        }

        // Test 3: Check game data for comparison
        console.log('\n\n3. Checking game data for comparison...');
        const gameData = client.getGameData();
        if (gameData) {
            console.log('✅ Game data available');
            console.log(`   System: ${gameData.system?.id}`);
            console.log(`   World: ${gameData.world?.title}`);
            console.log(`   Background: ${gameData.system?.background || 'null'}`);
        } else {
            console.log('❌ Game data is null');
        }

        const successCount = results.tests.filter((t: any) => t.success).length;
        results.success = successCount === results.tests.length;

        console.log(`\n\n📊 ${successCount}/${results.tests.length} tests passed`);
        return results;

    } catch (error: any) {
        console.error('❌ Test suite failed:', error.message);
        console.error(error.stack);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        console.log('\n📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testSceneData().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
