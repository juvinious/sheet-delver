import { DataManager } from '../../modules/shadowdark/data/DataManager';
import { fileURLToPath } from 'url';
import { logger } from '@shared/utils/logger';

export async function testRollTables() {
    logger.info('🧪 Test 11: Roll Table Operations (via DataManager)\n');

    const dataManager = DataManager.getInstance();

    try {
        logger.info('Initializing DataManager...');
        await dataManager.initialize();

        // Test 1: Fetch a roll table
        logger.info('\n--- Part 1: Fetch Roll Table ---');
        const TALENT_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT'; // Wizard Talents
        logger.info('Fetching UUID:', TALENT_TABLE_UUID);

        const table = await dataManager.getDocument(TALENT_TABLE_UUID);

        if (!table) {
            throw new Error(`Failed to fetch table with UUID: ${TALENT_TABLE_UUID}`);
        }

        logger.info('Table Name:', table.name);
        logger.info('Formula:', table.system?.formula || table.formula);
        logger.info('Results Count:', table.results?.length || 0);

        if (!table.results || table.results.length === 0) {
            throw new Error('Table has no results');
        }

        // Test 2: Perform a Draw
        logger.info('\n--- Part 2: Perform Draw ---');
        const result = await dataManager.draw(TALENT_TABLE_UUID);

        if (!result) {
            throw new Error('Draw failed');
        }

        logger.info('Roll Total:', result.total);
        logger.info('Results Count:', result.results.length);
        result.results.forEach((r: any, i: number) => {
            logger.info(`  [${i}] Text: ${r.text || r.description || r.name}`);
        });

        if (result.results.length === 0) {
            throw new Error('Draw returned no results');
        }

        logger.info('\n✅ Roll Table Tests Passed');
        return { success: true };

    } catch (error: any) {
        logger.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testRollTables().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
