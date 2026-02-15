import { DataManager } from '../modules/shadowdark/data/DataManager';
import { logger } from '../core/logger';

async function verifyDraw() {
    const dataManager = DataManager.getInstance();
    await dataManager.initialize();

    const testTables = [
        'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7', // Bard 3-6
        'Compendium.shadowdark.rollable-tables.RollTable.0vRwhfQgvAkzToHN', // Fighter 1-11
    ];

    for (const tableUuid of testTables) {
        console.log(`\nTesting Table: ${tableUuid}`);
        const result = await dataManager.draw(tableUuid);

        if (result) {
            console.log(`Draw Result:`);
            console.log(`- ID: ${result.id}`);
            console.log(`- Roll (2-12): ${result.roll}`);
            console.log(`- Total: ${result.total}`);
            console.log(`- Matched Results: ${result.results.length}`);

            result.results.forEach((r: any, i: number) => {
                console.log(`  [${i}] Range: [${r.range[0]}, ${r.range[1]}], Text: ${r.text || r.description || r.name}`);
                if (r.document) {
                    console.log(`      Hydrated Document: ${r.document.name} (${r.document.type})`);
                }
            });

            console.log(`- Items: ${result.items.length}`);
        } else {
            console.error(`Failed to draw from ${tableUuid}`);
        }
    }
}

verifyDraw().catch(console.error);
