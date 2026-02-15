import { ClientSocket } from '../../core/foundry/sockets/ClientSocket';
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
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
        console.log('📚 Fetching Journals...');
        const journals = await client.getJournals();
        console.log(`✅ Fetched ${journals.length} Journal Entries`);

        console.log('📁 Fetching Folders...');
        const folders = await client.getFolders('JournalEntry');
        console.log(`✅ Fetched ${folders.length} Journal Folders`);

        console.log('👥 Fetching Users...');
        const users = await client.getUsers();
        console.log(`✅ Fetched ${users.length} Users`);

        // 2. Create Journal
        console.log('📝 Creating Test Journal...');
        const createResult = await core.dispatchDocumentSocket('JournalEntry', 'create', {
            data: [{ name: 'Test Journal from Script', folder: null }],
            broadcast: true
        });
        const newJournal = createResult?.result?.[0];
        if (!newJournal) throw new Error('Failed to create journal');
        console.log(`✅ Created: ${newJournal.name} (${newJournal._id})`);

        // 3. Update Journal
        console.log('✍️ Updating Test Journal...');
        const updateResult = await core.dispatchDocumentSocket('JournalEntry', 'update', {
            updates: [{ _id: newJournal._id, name: 'Test Journal Updated' }],
            broadcast: true
        });
        const updatedJournal = updateResult?.result?.[0];
        console.log(`✅ Updated: ${updatedJournal?.name}`);

        // 4. Create Folder
        console.log('📂 Creating Test Folder...');
        const folderResult = await core.dispatchDocumentSocket('Folder', 'create', {
            data: [{ name: 'Test Test Folder', type: 'JournalEntry', folder: null }],
            broadcast: true
        });
        const newFolder = folderResult?.result?.[0];
        if (!newFolder) throw new Error('Failed to create folder');
        console.log(`✅ Created Folder: ${newFolder.name} (${newFolder._id})`);

        // 5. Delete Journal
        console.log('🗑️ Deleting Test Journal...');
        await core.dispatchDocumentSocket('JournalEntry', 'delete', {
            ids: [newJournal._id],
            broadcast: true
        });
        console.log('✅ Deleted Journal');

        // 6. Delete Folder
        console.log('🗑️ Deleting Test Folder...');
        await core.dispatchDocumentSocket('Folder', 'delete', {
            ids: [newFolder._id],
            broadcast: true
        });
        console.log('✅ Deleted Folder');

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

testJournals();
