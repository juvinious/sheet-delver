
import { ClientSocket } from '../../core/foundry/sockets/ClientSocket';
import { logger } from '../../core/logger';
import { loadConfig } from '../../core/config';
import 'dotenv/config';

// Force test env (Ignore read-only error for test script)
// @ts-ignore
process.env.NODE_ENV = 'test';

async function testJournals() {
    console.log('🧪 Test 6: Journals Endpoint Verification');

    const config = await loadConfig();
    if (!config) {
        console.error('❌ Could not load config');
        process.exit(1);
    }

    // Initialize Stack
    const { CoreSocket } = require('../../core/foundry/sockets/CoreSocket');
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

        console.log('📚 Fetching Journals...');
        const journals = await client.getJournals();

        console.log(`✅ Fetched ${journals.length} Journal Entries`);

        if (journals.length > 0) {
            console.log('--- Sample Journal ---');
            const sample = journals[0];
            console.log(`ID: ${sample._id}`);
            console.log(`Name: ${sample.name}`);
            console.log(`Pages: ${sample.pages?.length || 0}`);

            // Log ownership to verify filtering logic would work
            // (Client.getJournals returns raw data, filtering happens in API)
            console.log(`Ownership:`, JSON.stringify(sample.ownership));
            console.log('----------------------');
        } else {
            console.log('⚠️ No journals found. Testing Permission Logic might require data.');
        }

        client.disconnect();

    } catch (e) {
        console.error('❌ Test Failed:', e);
        client.disconnect();
        process.exit(1);
    }
}

testJournals();
