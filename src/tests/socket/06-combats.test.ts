import { ClientSocket } from '../../core/foundry/sockets/ClientSocket';
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import 'dotenv/config';

// Force test env (Ignore read-only error for test script)
// @ts-ignore
process.env.NODE_ENV = 'test';

async function testCombats() {
    console.log('🧪 Test 6: Combats Endpoint Verification');

    const config = await loadConfig();
    if (!config) {
        console.error('❌ Could not load config');
        process.exit(1);
    }

    // Initialize Stack
    const core = new CoreSocket(config.foundry);
    const client = new ClientSocket(config.foundry, core);

    try {
        console.log('📡 Connecting...');
        // Connect Core Socket (Actual connection)
        await core.connect();

        // ClientSocket doesn't need explicit connect, but we might want to ensure it's "ready"

        // Login as player (doratheexplorer) to test permissions
        // or GM? Let's use the config default (which was doratheexplorer in previous tests)
        console.log(`👤 Identifying as: ${(client as any).config.username}`);

        // 1. List
        console.log('📚 Fetching Combats...');
        const combats = await client.getCombats();
        console.log(`✅ Fetched ${combats.length} Combats`);
        const combat = combats[0];
        console.log(JSON.stringify(combat, null, 2));


        console.log('👥 Fetching Actors...');
        const actors = await client.getActors();
        console.log(`✅ Fetched ${actors.length} Actors`);
        console.log('👥 Fetching combatants...')
        for (const combatant of combat.combatants.sort((c: any, d: any) => d.initiative - c.initiative)) {
            const user = actors.find((actor: any) => actor._id === combatant.actorId);
            console.log(`✅ Fetched ${user.name} Initiative: ${combatant.initiative}`);
        }
        console.log('✅ Fetching combatants Success!')

        client.disconnect();
        core.disconnect();
        process.exit(0);

    } catch (e) {
        console.error('❌ Test Failed:', e);
        client.disconnect();
        core.disconnect();
        process.exit(1);
    }
}

testCombats();
