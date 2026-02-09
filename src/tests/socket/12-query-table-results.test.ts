/**
 * Test: Query TableResult documents directly
 * 
 * This test attempts to fetch TableResult documents for a specific table
 * using different socket API approaches.
 */

import { CoreSocket } from '../../core/foundry/sockets/CoreSocket.js';
import { loadConfig } from '../../core/config.js';

const TALENT_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT';

async function main() {
    console.log('🧪 Test: Query TableResult Documents\n');

    const configLine = await loadConfig();
    if (!configLine) {
        throw new Error('Failed to load configuration');
    }
    const config = configLine.foundry || configLine;

    const client = new CoreSocket(config);

    console.log('📡 Connecting...');
    await client.connect();

    try {
        // First, fetch the table
        console.log('\n--- Part 1: Fetch Table ---');
        const table = await client.fetchByUuid(TALENT_TABLE_UUID);
        console.log('Table Name:', table.name);
        console.log('Table ID:', table._id);
        console.log('Result IDs from table:', table.results);

        // Try to query TableResult documents directly
        console.log('\n--- Part 2: Query TableResult Documents ---');

        // Approach 1: Use dispatchDocumentSocket to query TableResult
        console.log('\nApproach 1: dispatchDocumentSocket with parent query');
        try {
            const response = await client.dispatchDocumentSocket('TableResult', 'get', {
                query: { parent: table._id },
                broadcast: false
            });
            console.log('Response:', JSON.stringify(response, null, 2));
        } catch (err: any) {
            console.log('Failed:', err.message);
        }

        // Approach 2: Try emitSocketEvent with getDocuments
        console.log('\nApproach 2: emitSocketEvent for TableResult');
        try {
            const response: any = await client.emitSocketEvent('getDocuments', {
                type: 'TableResult',
                operation: { ids: table.results }
            }, 5000);
            console.log('Response:', JSON.stringify(response, null, 2));
        } catch (err: any) {
            console.log('Failed:', err.message);
        }

        // Approach 3: Try fetching with embedded UUID format
        console.log('\nApproach 3: Fetch first result with embedded UUID');
        const firstResultId = table.results[0];
        const embeddedUuid = `${TALENT_TABLE_UUID}.TableResult.${firstResultId}`;
        console.log('Trying UUID:', embeddedUuid);
        try {
            const result = await client.fetchByUuid(embeddedUuid);
            console.log('Result:', JSON.stringify(result, null, 2));
        } catch (err: any) {
            console.log('Failed:', err.message);
        }

    } finally {
        await client.disconnect();
        console.log('📡 Disconnected');
    }
}

main().catch(console.error);
