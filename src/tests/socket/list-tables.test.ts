
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { fileURLToPath } from 'url';

export async function listTables() {
    console.log('🧪 Debug: Listing All Tables in shadowdark.rollable-tables\n');

    const configLine = await loadConfig();
    if (!configLine) throw new Error('Failed to load configuration');
    const config = configLine.foundry || configLine;

    const client = new CoreSocket(config);

    try {
        console.log('📡 Connecting...');
        await client.connect();
        if (!client.isConnected) throw new Error('Failed to connect');

        console.log('Fetching pack shadowdark.rollable-tables...');
        // We can't easily iterate packs with the current CoreSocket implementation 
        // unless we have a method for it. 
        // Let's assume we can use a known UUID that SHOULD exist to test connection.
        // "Compendium.shadowdark.rollable-tables.Recalling" -> 
        // actually let's try to fetch a known table from the 11-roll-tables test
        // Wizard Talents: Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT

        const WIZARD_UUID = 'Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT';
        console.log(`Testing connection with Wizard Table: ${WIZARD_UUID}`);
        const wizardTable = await client.fetchByUuid(WIZARD_UUID);

        if (wizardTable) {
            console.log(`✅ Connection Verified. Found: ${wizardTable.name}`);
        } else {
            console.log(`❌ Could not fetch Wizard table either. Socket/Auth issue?`);
        }

        // Now try to find Bard by guessing or if we can use a broader search?
        // No broad search in CoreSocket yet. 
        // But we DO have the UUID from the file system: ZzffJkaIfmdPzdE7
        // If fetchByUuid fails, maybe the pack isn't "shadowdark.rollable-tables"?
        // Let's check the Wizard table's pack.

    } catch (error: any) {
        console.error('❌ Debug failed:', error.message);
    } finally {
        if (client.isConnected) {
            await client.disconnect();
            console.log('\n📡 Disconnected');
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    listTables().then(() => process.exit(0));
}
