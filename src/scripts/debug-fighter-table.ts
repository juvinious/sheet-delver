
import { dataManager } from '../modules/shadowdark/data/DataManager';
import { processRollResult } from '../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

async function verifyFighterProcessing() {
    await dataManager.initialize();


    const TABLE_UUID = 'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7';
    console.log(`\n🔍 Fetching Table: ${TABLE_UUID} (BARD 12)`);

    const table = dataManager.index.get(TABLE_UUID);
    if (!table) {
        console.error('❌ Table not found!');
        return;
    }

    console.log(`✅ Table Found: ${table.name}`);

    // Filter results for Roll 12
    const results12 = (table.results || []).filter((r: any) => r.range[0] <= 12 && r.range[1] >= 12);
    console.log(`\n📋 Raw Objects for Bard Roll 12 (Count: ${results12.length})`);
    console.log(JSON.stringify(results12, null, 2));

    // Simulate Draw
    console.log('\n🎲 Simulating Draw (Roll: 12)...');
    const drawResult = {
        id: table._id,
        roll: 12,
        total: 12,
        results: results12,
        items: [], // We don't have hydration here but processRollResult should handle text
        table: table
    };

    const processed = await processRollResult({ result: drawResult, table });

    console.log('\n⚙️ Processed Result:');
    console.log(`Item Name: "${processed.item?.name || processed.item?.text}"`);
    console.log(`Needs Choice: ${processed.needsChoice}`);
    console.log(`Choice Count: ${processed.choiceCount}`);

    if (processed.choiceOptions.length > 0) {
        console.log(`\n🤔 Choice Options (${processed.choiceOptions.length}):`);
        console.log(JSON.stringify(processed.choiceOptions, null, 2));
    }

    // Verify Title Fix
    if (processed.item?.name === "Choose One" || processed.item?.name?.includes("Choose")) {
        console.log("\n✅ SUCCESS: Title is correct (Choose One/instruction).");
    } else {
        console.log(`\n❌ FAILURE: Title is incorrect: "${processed.item?.name}"`);
    }

    // Verify Unknown Option Fix
    const hasUnknown = processed.choiceOptions.some((opt: any) => opt.name === "Unknown Option");
    if (!hasUnknown) {
        console.log("✅ SUCCESS: No 'Unknown Option' found.");
    } else {
        console.log("❌ FAILURE: 'Unknown Option' still present!");
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    verifyFighterProcessing();
}
