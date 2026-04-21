
import { processRollResult } from '../../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';
import { logger } from '@shared/utils/logger';

// Mock Fighter Table Result for Roll 7 ("Choose 1")
const mockFighterTableRoll7 = {
    uuid: "Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9",
    name: "Fighter Talents",
    results: [
        { _id: "r1", text: "Choose one option:", type: 0, range: [7, 7] }, // Instruction
        { _id: "r2", text: "+2 to Constitution", type: 0, range: [7, 7] },
        { _id: "r3", text: "+2 to Dexterity", type: 0, range: [7, 7] }
    ]
};

const mockRollResult7 = {
    roll: { total: 7, formula: "2d6" }, // Fighter level 1 uses 2d6? Or 1d12? The log said "total: 7" and "formula: 2d6".
    total: 7,
    results: mockFighterTableRoll7.results,
    table: mockFighterTableRoll7,
    items: []
};

export async function testFighterRoll7() {
    logger.info('🧪 Test: Fighter 7 Logic (Choose 1)\n');

    try {
        const { choiceOptions } = await processRollResult({
            result: mockRollResult7,
            table: mockFighterTableRoll7
        });

        const optionNames = choiceOptions.map(o => o.name || o.text || "[NO NAME]");
        logger.info("Options:", optionNames);

        // Assertions
        const hasHeader = choiceOptions.some(o => (o.text || "").includes("Choose one"));
        const hasNoName = choiceOptions.some(o => !o.text && !o.name);

        let passed = true;

        if (hasHeader) {
            logger.error("❌ FAILED: Header retained");
            passed = false;
        } else {
            // If header is NOT retained, does it exist as an empty item?
            if (hasNoName) {
                logger.error("❌ FAILED: Header item exists but text is stripped/empty");
                passed = false;
            }
        }

        if (choiceOptions.length !== 2) {
            logger.error(`❌ FAILED: Expected 2 options, got ${choiceOptions.length}`);
            passed = false;
        }

        if (passed) {
            logger.info('✅ Fighter 7 Logic Verified');
            return { success: true };
        }
        return { success: false };

    } catch (e: any) {
        logger.error('❌ Error:', e.message);
        return { success: false, error: e.message };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testFighterRoll7().then(r => process.exit(r.success ? 0 : 1));
}
