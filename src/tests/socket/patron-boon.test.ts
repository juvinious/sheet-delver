
import { processRollResult } from '../../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

// Mock Patron Boon Table (Mugdulblub)
// UUID matches value in roll-table-patterns.ts
const mockPatronTable = {
    uuid: "Compendium.shadowdark.rollable-tables.RollTable.uM6xHa4gqStMgONB",
    name: "Mugdulblub Boon",
    img: "icons/svg/d20.svg",
    description: "Patron boons.",
    results: [
        {
            _id: "r1",
            text: "Choose one: +2 to Strength or a unique boon.",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12],
            documentCollection: "shadowdark.rollable-tables",
            documentId: "uM6xHa4gqStMgONB"
        },
        {
            _id: "r2",
            text: "+2 to Strength",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        },
        {
            _id: "r3", // BLANK RESULT
            text: " ",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        },
        {
            _id: "r4",
            text: "Unique Boon: Gelatinous Skin",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        }
    ]
};

const mockRollResult = {
    roll: {
        total: 12, // Roll 12 matches the complex filter
        formula: "1d12"
    },
    total: 12,
    results: mockPatronTable.results,
    table: mockPatronTable,
    items: []
};

export async function testPatronBoonFiltering() {
    console.log('🧪 Test: Patron Boon (Mugdulblub 12) Logic\n');

    try {
        const { item, needsChoice, choiceOptions, choiceCount } = await processRollResult({
            result: mockRollResult,
            table: mockPatronTable
        });

        // Verification
        if (!needsChoice) throw new Error("Expected needsChoice to be true");

        console.log("Generated Options:", choiceOptions.map(o => o.name || o.text));

        // 1. Verify Distribute Stats mapped from "+2 to Strength"
        const hasDistribute = choiceOptions.some((o: any) => o.name === "Distribute to Stats");
        if (!hasDistribute) throw new Error("Missing 'Distribute to Stats' option (should be mapped from +2 result)");

        // 2. Verify Blank Dropped
        const hasBlank = choiceOptions.some((o: any) => !o.text || o.text.trim() === "");
        if (hasBlank) throw new Error("Found blank option that should have been dropped");

        // 3. Verify Header Dropped
        const hasHeader = choiceOptions.some((o: any) => o.text.includes("Choose one"));
        if (hasHeader) throw new Error("Found header 'Choose one' that should have been dropped");

        // 4. Verify Unique Boon Kept
        const hasUnique = choiceOptions.some((o: any) => o.text.includes("Gelatinous Skin"));
        if (!hasUnique) throw new Error("Missing 'Unique Boon' option");

        console.log('✅ Patron Boon Logic Verified');
        return { success: true };
    } catch (e: any) {
        console.error('❌ Test failed:', e.message);
        return { success: false, error: e.message };
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testPatronBoonFiltering().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
