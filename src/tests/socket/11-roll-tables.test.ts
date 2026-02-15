import { DataManager } from '../../modules/shadowdark/data/DataManager';
import { fileURLToPath } from 'url';

export async function testRollTables() {
    console.log('🧪 Test 11: Roll Table Operations (via DataManager)\n');

    const dataManager = DataManager.getInstance();

    try {
        console.log('Initializing DataManager...');
        await dataManager.initialize();

        // Test 1: Fetch a roll table
        console.log('\n--- Part 1: Fetch Roll Table ---');
        const TALENT_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT'; // Wizard Talents
        console.log('Fetching UUID:', TALENT_TABLE_UUID);

        const table = await dataManager.getDocument(TALENT_TABLE_UUID);

        if (!table) {
            throw new Error(`Failed to fetch table with UUID: ${TALENT_TABLE_UUID}`);
        }

        console.log('Table Name:', table.name);
        console.log('Formula:', table.system?.formula || table.formula);
        console.log('Results Count:', table.results?.length || 0);

        if (!table.results || table.results.length === 0) {
            throw new Error('Table has no results');
        }

        // Test 2: Perform a Draw
        console.log('\n--- Part 2: Perform Draw ---');
        const result = await dataManager.draw(TALENT_TABLE_UUID);

        if (!result) {
            throw new Error('Draw failed');
        }

        console.log('Roll Total:', result.total);
        console.log('Results Count:', result.results.length);
        result.results.forEach((r: any, i: number) => {
            console.log(`  [${i}] Text: ${r.text || r.description || r.name}`);
        });

        if (result.results.length === 0) {
            throw new Error('Draw returned no results');
        }

        console.log('\n✅ Roll Table Tests Passed');
        return { success: true };

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testRollTables().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
