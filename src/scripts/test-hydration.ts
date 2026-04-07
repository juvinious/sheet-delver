import { DataManager } from '../modules/shadowdark/data/DataManager';
import { logger } from '@shared/utils/logger';

async function testHydration() {
    logger.info("Starting hydration test...");
    const dataManager = DataManager.getInstance();
    await dataManager.initialize();

    // Check a known table, e.g., Gear table
    const GEAR_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RollTable.yVogBTQYwjpWB7YI';
    const gearTable = await dataManager.getDocument(GEAR_TABLE_UUID);

    if (gearTable) {
        logger.info(`Found table: ${gearTable.name}`);
        logger.info(`Results count: ${gearTable.results?.length}`);

        if (gearTable.results && gearTable.results.length > 0) {
            const firstResult = gearTable.results[0];
            logger.info("First result sample:", JSON.stringify(firstResult, null, 2));

            if (firstResult.range && Array.isArray(firstResult.range)) {
                logger.info("SUCCESS: Results have ranges!");
            } else {
                logger.info("FAILURE: Results missing ranges.");
            }
        } else {
            logger.info("FAILURE: Table has no results.");
        }
    } else {
        logger.info(`FAILURE: Could not find table ${GEAR_TABLE_UUID}`);
        logger.info("Available rollable-tables keys:");
        for (const key of dataManager.index.keys()) {
            if (key.includes('rollable-tables')) {
                logger.info(`  - ${key}`);
            }
        }
    }

    process.exit(0);
}

testHydration().catch(err => {
    logger.error("Test failed:", err);
    process.exit(1);
});
