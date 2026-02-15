
import { processRollResult } from '../../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

// Mock Titania Table Result (based on user report/screenshots)
const mockTitaniaTable = {
    uuid: "CCompendium.shadowdark.rollable-tables.RollTable.mi0QYvreMf9j512E",
    name: "Titania Boon",
    results: [
        {
            _id: "r1",
            text: "Choose one option:", // Potential header
            type: 0,
            range: [12, 12]
        },
        {
            _id: "r2",
            text: "+1 to Strength",
            type: 0,
            range: [12, 12]
        },
        {
            _id: "r3",
            text: "+2 to Charisma",
            type: 0,
            range: [12, 12]
        },
        {
            _id: "r4",
            text: "Roll a patron boon",
            type: 0,
            range: [12, 12]
        },
        {
            _id: "r5",
            text: "+1 to Melee Attacks", // Should NOT be consolidated
            type: 0,
            range: [12, 12]
        }
    ]
};

const mockRollResult = {
    roll: { total: 12, formula: "1d12" },
    total: 12,
    results: mockTitaniaTable.results,
    table: mockTitaniaTable,
    items: []
};

export async function testTitania() {
    console.log('🧪 Test: Titania 12 Logic\n');

    try {
        const { choiceOptions } = await processRollResult({
            result: mockRollResult,
            table: mockTitaniaTable
        });

        console.log("Options:", choiceOptions.map(o => o.name || o.text));

        // Assertions
        const hasHeader = choiceOptions.some(o => (o.text || "").includes("Choose one"));
        const hasStat1 = choiceOptions.some(o => (o.text || "").includes("+1 to Strength")); // Should be FALSE
        const hasDistribute = choiceOptions.some(o => o.name === "Distribute to Stats"); // Should be TRUE
        const hasBoon = choiceOptions.some(o => o.name === "Patron Boon"); // Should be TRUE
        const hasMelee = choiceOptions.some(o => (o.text || "").includes("+1 to Melee Attacks")); // Should be TRUE (distinct)

        if (hasHeader) console.error("❌ FAILED: Header 'Choose one' was not stripped");
        if (hasStat1) console.error("❌ FAILED: '+1 to Strength' was not consolidated");
        if (!hasDistribute) console.error("❌ FAILED: 'Distribute to Stats' missing");
        if (!hasBoon) console.error("❌ FAILED: 'Patron Boon' missing");
        if (!hasMelee) console.error("❌ FAILED: '+1 to Melee Attacks' was wrongly consolidated/lost");

        if (!hasHeader && !hasStat1 && hasDistribute && hasBoon && hasMelee) {
            console.log('✅ Titania Logic Verified');
            return { success: true };
        }
        return { success: false };

    } catch (e: any) {
        console.error('❌ Error:', e.message);
        return { success: false, error: e.message };
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testTitania().then(r => process.exit(r.success ? 0 : 1));
}
