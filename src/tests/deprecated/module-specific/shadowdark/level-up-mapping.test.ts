import { DataManager } from '../modules/shadowdark/data/DataManager';
import * as levelUpEngine from '../modules/shadowdark/api/level-up-engine';
import { logger } from '@shared/utils/logger';

async function verifyMapping() {
    const dataManager = DataManager.getInstance();
    await dataManager.initialize();

    const testCases: any[] = [
        {
            name: "Fighter Weapon Mastery (Roll 2)",
            tableUuid: 'Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9',
            rollOverride: 2,
            expectedAction: 'weapon-mastery'
        },
        {
            name: "Fighter Choice (Roll 7)",
            tableUuid: 'Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9',
            rollOverride: 7,
            expectedAction: undefined
        },
        {
            name: "Bard Stat selection from Choice (Roll 12)",
            tableUuid: 'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7',
            rollOverride: 12,
            expectedChoiceAction: 'stat-pool'
        },
        {
            name: "Fighter Stat selection from Choice (Roll 12)",
            tableUuid: 'Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9',
            rollOverride: 12,
            expectedChoiceAction: 'stat-pool'
        },
        {
            name: "Bard Stat Pool (Roll 7)",
            tableUuid: 'Compendium.shadowdark.rollable-tables.RollTable.ZzffJkaIfmdPzdE7',
            rollOverride: 7,
            expectedAction: 'stat-pool'
        }
    ];

    for (const test of testCases) {
        logger.info(`\n>>> Testing: ${test.name}`);
        const result = await dataManager.draw(test.tableUuid, test.rollOverride);

        if (result) {
            const processed = await levelUpEngine.processRollResult({
                result,
                table: result.table
            });

            logger.info(`Roll: ${processed.item?.name || 'Multiple'}`);
            logger.info(`- Action: ${processed.action}`);
            logger.info(`- Config: ${JSON.stringify(processed.config)}`);
            logger.info(`- Needs Choice: ${processed.needsChoice}`);

            if (processed.needsChoice) {
                logger.info(`- Choices (${processed.choiceOptions.length}):`);
                processed.choiceOptions.forEach((o: any) => {
                    logger.info(`  * ${o.name || o.text || o.description} -> Action: ${o.action || 'none'}`);
                });
            }

            let success = false;
            if (test.expectedAction !== undefined) {
                success = processed.action === test.expectedAction;
            } else if (test.expectedChoiceAction !== undefined) {
                success = processed.choiceOptions.some((o: any) => o.action === test.expectedChoiceAction);
            } else {
                success = processed.action === undefined;
            }

            if (success) {
                logger.info(`✅ SUCCESS: Mapping matches expectation`);
            } else {
                logger.error(`❌ FAILURE: Mapping did not match expectation`);
                if (test.expectedAction) logger.error(`  Expected Action: ${test.expectedAction}`);
                if (test.expectedChoiceAction) logger.error(`  Expected Choice Action: ${test.expectedChoiceAction}`);
            }
        } else {
            logger.error(`Failed to draw from ${test.tableUuid}`);
        }
    }
}

verifyMapping().catch(logger.error);
