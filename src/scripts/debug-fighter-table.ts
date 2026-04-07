
import { dataManager } from '../modules/shadowdark/data/DataManager';
import { processRollResult } from '../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

async function verifyFighterProcessing() {
    await dataManager.initialize();


    const TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7';
    logger.info(`\n🔍 Fetching Table: ${TABLE_UUID} (BARD 12)`);

    const table = dataManager.index.get(TABLE_UUID);
    if (!table) {
        logger.error('❌ Table not found!');
        return;
    }

    logger.info(`✅ Table Found: ${table.name}`);

    // Filter results for Roll 12
    const results12 = (table.results || []).filter((r: any) => r.range[0] <= 12 && r.range[1] >= 12);
    logger.info(`\n📋 Raw Objects for Bard Roll 12 (Count: ${results12.length})`);
    logger.info(JSON.stringify(results12, null, 2));

    // Simulate Draw
    logger.info('\n🎲 Simulating Draw (Roll: 12)...');
    const drawResult = {
        id: table._id,
        roll: 12,
        total: 12,
        results: results12,
        items: [], // We don't have hydration here but processRollResult should handle text
        table: table
    };

    const processed = await processRollResult({ result: drawResult, table });

    logger.info('\n⚙️ Processed Result:');
    logger.info(`Item Name: "${processed.item?.name || processed.item?.text}"`);
    logger.info(`Needs Choice: ${processed.needsChoice}`);
    logger.info(`Choice Count: ${processed.choiceCount}`);

    if (processed.choiceOptions.length > 0) {
        logger.info(`\n🤔 Choice Options (${processed.choiceOptions.length}):`);
        logger.info(JSON.stringify(processed.choiceOptions, null, 2));
    }

    // Verify Title Fix
    if (processed.item?.name === "Choose One" || processed.item?.name?.includes("Choose")) {
        logger.info("\n✅ SUCCESS: Title is correct (Choose One/instruction).");
    } else {
        logger.info(`\n❌ FAILURE: Title is incorrect: "${processed.item?.name}"`);
    }

    // Verify Unknown Option Fix
    const hasUnknown = processed.choiceOptions.some((opt: any) => opt.name === "Unknown Option");
    if (!hasUnknown) {
        logger.info("✅ SUCCESS: No 'Unknown Option' found.");
    } else {
        logger.info("❌ FAILURE: 'Unknown Option' still present!");
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    verifyFighterProcessing();
}
