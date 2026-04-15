import { DataManager } from '../modules/shadowdark/data/DataManager';
import { logger } from '@shared/utils/logger';

async function verifyDraw() {
    const dataManager = DataManager.getInstance();
    await dataManager.initialize();

    const testTables = [
        'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7', // Bard 3-6
        'Compendium.shadowdark.rollable-tables.RollTable.0vRwhfQgvAkzToHN', // Fighter 1-11
    ];

    for (const tableUuid of testTables) {
        logger.info(`\nTesting Table: ${tableUuid}`);
        const result = await dataManager.draw(tableUuid);

        if (result) {
            logger.info(`Draw Result:`);
            logger.info(`- ID: ${result.id}`);
            logger.info(`- Roll (2-12): ${result.roll}`);
            logger.info(`- Total: ${result.total}`);
            logger.info(`- Matched Results: ${result.results.length}`);

            result.results.forEach((r: any, i: number) => {
                logger.info(`  [${i}] Range: [${r.range[0]}, ${r.range[1]}], Text: ${r.text || r.description || r.name}`);
                if (r.document) {
                    logger.info(`      Hydrated Document: ${r.document.name} (${r.document.type})`);
                }
            });

            logger.info(`- Items: ${result.items.length}`);
        } else {
            logger.error(`Failed to draw from ${tableUuid}`);
        }
    }
}

verifyDraw().catch(logger.error);
