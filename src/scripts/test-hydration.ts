import { DataManager } from '../modules/shadowdark/data/DataManager';
import { logger } from '../core/logger';

async function testHydration() {
    console.log("Starting hydration test...");
    const dataManager = DataManager.getInstance();
    await dataManager.initialize();

    // Check a known table, e.g., Gear table
    const GEAR_TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RollTable.yVogBTQYwjpWB7YI';
    const gearTable = await dataManager.getDocument(GEAR_TABLE_UUID);

    if (gearTable) {
        console.log(`Found table: ${gearTable.name}`);
        console.log(`Results count: ${gearTable.results?.length}`);

        if (gearTable.results && gearTable.results.length > 0) {
            const firstResult = gearTable.results[0];
            console.log("First result sample:", JSON.stringify(firstResult, null, 2));

            if (firstResult.range && Array.isArray(firstResult.range)) {
                console.log("SUCCESS: Results have ranges!");
            } else {
                console.log("FAILURE: Results missing ranges.");
            }
        } else {
            console.log("FAILURE: Table has no results.");
        }
    } else {
        console.log(`FAILURE: Could not find table ${GEAR_TABLE_UUID}`);
        console.log("Available rollable-tables keys:");
        for (const key of dataManager.index.keys()) {
            if (key.includes('rollable-tables')) {
                console.log(`  - ${key}`);
            }
        }
    }

    process.exit(0);
}

testHydration().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
