import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { fileURLToPath } from 'url';

export async function testRollTables() {
    console.log('🧪 Test 11: Roll Table Operations\n');

    const configLine = await loadConfig();
    if (!configLine) {
        throw new Error('Failed to load configuration');
    }
    const config = configLine.foundry || configLine;

    const client = new CoreSocket(config);

    try {
        console.log('📡 Connecting...');
        await client.connect();

        if (!client.isConnected) throw new Error('Failed to connect');

        // Test 1: Fetch a roll table
        console.log('\n--- Part 1: Fetch Roll Table ---');
        const TALENT_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT'; // Wizard Talents
        console.log('Fetching UUID:', TALENT_TABLE_UUID);

        const table = await client.fetchByUuid(TALENT_TABLE_UUID);

        if (!table) {
            throw new Error(`Failed to fetch table with UUID: ${TALENT_TABLE_UUID}`);
        }

        console.log('Table Name:', table.name);
        console.log('Formula:', table.formula);
        console.log('Results Count:', table.results?.length || 0);

        if (!table.results || table.results.length === 0) {
            throw new Error('Table has no results');
        }

        // Test 2: Examine result structure
        console.log('\n--- Part 2: Examine Result Structure ---');
        console.log('Full table object keys:', Object.keys(table));

        // Check _source for embedded documents
        if (table._source) {
            console.log('\nTable._source exists!');
            console.log('_source keys:', Object.keys(table._source));
            if (table._source.results) {
                console.log('_source.results type:', typeof table._source.results);
                console.log('_source.results is array?:', Array.isArray(table._source.results));
                if (Array.isArray(table._source.results) && table._source.results.length > 0) {
                    console.log('\nFirst _source result:', JSON.stringify(table._source.results[0], null, 2));
                }
            }
        }

        // Check for collections
        if ((table as any).collections) {
            console.log('\nTable has collections!');
            console.log('Collections keys:', Object.keys((table as any).collections));
        }

        // Log raw results
        console.log('\nTable.results type:', typeof table.results);
        console.log('Table.results is array?:', Array.isArray(table.results));
        if (Array.isArray(table.results)) {
            console.log('First result (raw):', table.results[0]);
            console.log('First result type:', typeof table.results[0]);
        }

        // Test 2.5: Check if table has draw() method
        console.log('\n--- Part 2.5: Test table.draw() Method ---');
        console.log('Table has draw method?:', typeof (table as any).draw === 'function');

        if (typeof (table as any).draw === 'function') {
            console.log('Attempting to call table.draw()...');
            try {
                const drawResult = await (table as any).draw();
                console.log('Draw result:', JSON.stringify(drawResult, null, 2));
            } catch (err: any) {
                console.log('Draw failed:', err.message);
            }
        } else {
            console.log('Table object does not have a draw() method');
            console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(table)));
        }

        // Test 3: Use the new rollTable() method
        console.log('\n--- Part 3: Test rollTable() Method ---');

        const tableResult = await client.rollTable(TALENT_TABLE_UUID, {
            displayChat: true
        });

        console.log('Result count:', tableResult.results.length);
        console.log('Results:', tableResult.results.map((r: any) => r.text || r.name));

        if (tableResult.results.length === 0) {
            throw new Error(`rollTable() returned no results for total ${tableResult.total}`);
        }

        // Test 4: Roll with specific mode (Self)
        console.log('\n--- Part 4: Test rollTable() with Mode: Self ---');
        const selfRollResult = await client.rollTable(TALENT_TABLE_UUID, {
            displayChat: true,
            rollMode: 'self'
        });
        console.log('Self Roll Result Total:', selfRollResult.total);
        console.log('Self Roll Results:', selfRollResult.results.length);

        console.log('\n✅ Roll Table Tests Passed');
        return { success: true };

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        if (client.isConnected) {
            await client.disconnect();
            console.log('📡 Disconnected\n');
        }
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testRollTables().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
