import { SocketFoundryClient } from '../src/lib/foundry/SocketClient';
import { loadConfig } from '../src/lib/config';

async function testSocketMethods() {
    console.log('🧪 Testing Socket Client Methods\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error("Failed to load configuration");
    }

    const client = new SocketFoundryClient(config.foundry);
    const results: { method: string; status: string; error?: string; data?: any }[] = [];

    try {
        console.log('📡 Connecting...');
        await client.connect();
        console.log('✅ Connected!\n');

        // Phase 1: Read-Only Operations (Safest)
        console.log('=== PHASE 1: READ-ONLY OPERATIONS ===\n');

        // Test 1: getSystem()
        console.log('1️⃣  Testing getSystem()...');
        try {
            const system = await client.getSystem();
            console.log('   ✅ Success:', JSON.stringify(system).substring(0, 100) + '...');
            results.push({ method: 'getSystem', status: 'success', data: system });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'getSystem', status: 'failed', error: error.message });
        }

        // Test 2: getActors()
        console.log('\n2️⃣  Testing getActors()...');
        try {
            const actors = await client.getActors();
            console.log(`   ✅ Success: Found ${actors.length} actors`);
            if (actors.length > 0) {
                console.log(`   First actor: ${actors[0].name} (${actors[0]._id})`);
            }
            results.push({ method: 'getActors', status: 'success', data: { count: actors.length } });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'getActors', status: 'failed', error: error.message });
        }

        // Test 3: getActor(id) - only if we have actors
        const actorsForTest = await client.getActors().catch(() => []);
        if (actorsForTest.length > 0) {
            const testActorId = actorsForTest[0]._id;
            console.log(`\n3️⃣  Testing getActor('${testActorId}')...`);
            try {
                const actor = await client.getActor(testActorId);
                console.log(`   ✅ Success: ${actor.name}`);
                results.push({ method: 'getActor', status: 'success', data: { name: actor.name } });
            } catch (error: any) {
                console.log('   ❌ Failed:', error.message);
                results.push({ method: 'getActor', status: 'failed', error: error.message });
            }
        }

        // Test 4: getSystemData()
        console.log('\n4️⃣  Testing getSystemData()...');
        try {
            const systemData = await client.getSystemData();
            console.log('   ✅ Success:', JSON.stringify(systemData).substring(0, 100) + '...');
            results.push({ method: 'getSystemData', status: 'success' });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'getSystemData', status: 'failed', error: error.message });
        }

        // Test 5: getUsers()
        console.log('\n5️⃣  Testing getUsers()...');
        try {
            const users = await client.getUsers();
            console.log(`   ✅ Success: Found ${users.length} users`);
            results.push({ method: 'getUsers', status: 'success', data: { count: users.length } });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'getUsers', status: 'failed', error: error.message });
        }

        // Test 6: evaluate() - simple test
        console.log('\n6️⃣  Testing evaluate() with simple expression...');
        try {
            const worldId = await client.evaluate(() => (game as any).world.id);
            console.log(`   ✅ Success: World ID = ${worldId}`);
            results.push({ method: 'evaluate', status: 'success', data: { worldId } });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'evaluate', status: 'failed', error: error.message });
        }

        // Test 7: getAllCompendiumIndices()
        console.log('\n7️⃣  Testing getAllCompendiumIndices()...');
        try {
            const indices = await client.getAllCompendiumIndices();
            console.log(`   ✅ Success: Found ${indices.length} compendium packs`);
            results.push({ method: 'getAllCompendiumIndices', status: 'success', data: { count: indices.length } });
        } catch (error: any) {
            console.log('   ❌ Failed:', error.message);
            results.push({ method: 'getAllCompendiumIndices', status: 'failed', error: error.message });
        }

    } catch (error: any) {
        console.error('\n❌ Connection failed:', error.message);
        results.push({ method: 'connect', status: 'failed', error: error.message });
    } finally {
        console.log('\n📊 Disconnecting...');
        await client.disconnect();
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`\n✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((successful / results.length) * 100).toFixed(1)}%\n`);

    results.forEach(r => {
        const icon = r.status === 'success' ? '✅' : '❌';
        console.log(`${icon} ${r.method}`);
        if (r.error) {
            console.log(`   Error: ${r.error}`);
        }
    });

    console.log('\n' + '='.repeat(50));
}

testSocketMethods().catch(console.error);
