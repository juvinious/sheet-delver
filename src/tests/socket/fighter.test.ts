
import { processRollResult } from '../../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

// Mock Fighter Table Result (No blanks, as user insisted)
const mockFighterTable = {
    uuid: "Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9",
    name: "Fighter Talents",
    results: [
        { _id: "r1", text: "Choose one option:", type: 0, range: [12, 12] },
        { _id: "r2", text: "+1 to Strength", type: 0, range: [12, 12] },
        { _id: "r4", text: "+1 to Dexterity", type: 0, range: [12, 12] },
        { _id: "r5", text: "+1 to Constitution", type: 0, range: [12, 12] },
        { _id: "r6", text: "Weapon Mastery", type: 0, range: [12, 12] }
    ]
};

const mockRollResult = {
    roll: { total: 12, formula: "1d12" },
    total: 12,
    results: mockFighterTable.results,
    table: mockFighterTable,
    items: []
};

export async function testFighter() {
    console.log('🧪 Test: Fighter 12 Logic\n');

    try {
        const { choiceOptions } = await processRollResult({
            result: mockRollResult,
            table: mockFighterTable
        });

        const optionNames = choiceOptions.map(o => o.name || o.text);
        console.log("Options:", optionNames);

        // Assertions
        const hasHeader = choiceOptions.some(o => (o.text || "").includes("Choose one"));
        const distributeCount = choiceOptions.filter(o => o.name === "Distribute to Stats").length;
        const hasWeaponMastery = choiceOptions.some(o => (o.text || "").includes("Weapon Mastery"));

        let passed = true;

        if (hasHeader) { console.error("❌ FAILED: Header retained"); passed = false; }
        // We expect EXACTLY ONE "Distribute to Stats" option after deduplication
        if (distributeCount > 1) {
            console.error(`❌ FAILED: 'Distribute to Stats' duplicated ${distributeCount} times`);
            passed = false;
        } else if (distributeCount === 0) {
            console.error("❌ FAILED: 'Distribute to Stats' missing");
            passed = false;
        }

        // Verify no "Unknown Option" or blanks are present in the final list
        const hasUnknown = choiceOptions.some(o => o.name === "Unknown Option");
        const hasBlankName = choiceOptions.some(o => !o.name || o.name.trim() === "");
        if (hasUnknown) { console.error("❌ FAILED: 'Unknown Option' present (should be real text)"); passed = false; }
        if (hasBlankName) { console.error("❌ FAILED: Blank name present"); passed = false; }

        if (passed) {
            console.log('✅ Fighter Logic Verified');
            return { success: true };
        }
        return { success: false };

    } catch (e: any) {
        console.error('❌ Error:', e.message);
        return { success: false, error: e.message };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testFighter().then(r => process.exit(r.success ? 0 : 1));
}
