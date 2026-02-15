
import { processRollResult } from '../../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

// Mock Warlock Level 12 Table Result
const mockWarlockTable = {
    uuid: "Compendium.shadowdark.rollable-tables.RollTable.xM3hghlK5nvo46Vo",
    name: "Warlock Talent",
    img: "icons/svg/d20.svg",
    description: "Warlock talents.",
    results: [
        {
            _id: "r1",
            text: "Choose one: +2 to Intelligence, +2 to Charisma, or roll a patron boon.",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12],
            documentCollection: "shadowdark.rollable-tables",
            documentId: "xM3hghlK5nvo46Vo"
        },
        {
            _id: "r2",
            text: "+2 to Intelligence",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        },
        {
            _id: "r3",
            text: "+2 to Charisma",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        },
        {
            _id: "r4",
            text: "Roll a patron boon",
            type: 0,
            img: "icons/svg/d20.svg",
            range: [12, 12]
        }
    ]
};

const mockRollResult = {
    roll: {
        total: 12, // Roll 12
        formula: "1d12"
    },
    total: 12,
    results: mockWarlockTable.results,
    table: mockWarlockTable,
    items: []
};

export async function testRoll12() {
    console.log('🧪 Test: Warlock Roll 12 Logic\n');

    try {
        const { item, needsChoice, choiceOptions, choiceCount } = await processRollResult({
            result: mockRollResult,
            table: mockWarlockTable
        });

        // assertions
        if (!needsChoice) throw new Error("Expected needsChoice to be true");

        const hasDistribute = choiceOptions.some((o: any) => o.name === "Distribute to Stats");
        const hasPatronBoon = choiceOptions.some((o: any) => o.type === "PatronBoon");
        const hasOriginalStat = choiceOptions.some((o: any) => (o.name || o.text).includes("+2 to Intelligence"));

        if (!hasDistribute) throw new Error("Missing 'Distribute to Stats' option");
        if (!hasPatronBoon) throw new Error("Missing 'Patron Boon' option");
        if (hasOriginalStat) throw new Error("Found filtered option '+2 to Intelligence'");

        console.log('✅ Roll 12 Logic Verified');
        return { success: true };
    } catch (e: any) {
        console.error('❌ Test failed:', e.message);
        return { success: false, error: e.message };
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testRoll12().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
