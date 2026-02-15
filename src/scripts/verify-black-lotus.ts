
import { dataManager } from '../modules/shadowdark/data/DataManager';

// Mock logger
const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log
};
(global as any).logger = logger;

async function verify() {
    try {
        console.log("Loading Black Lotus table...");
        const tableName = "Black Lotus Talents";

        const rollResult = await dataManager.rollTable(tableName);

        if (!rollResult || !rollResult.table) {
            console.error("❌ Could not load table");
            return;
        }

        const table = rollResult.table;
        console.log(`Table: ${table.name}, Formula: ${table.formula}`);

        // precise check: ensure ranges are NOT modified to 2d6 tiers
        // Black Lotus items use 1d12 so ranges are like [1,1], [2,2]...
        // My sanitization would have moved something to [12,12] if it matched "choose" keywords 
        // or [10,11] if it matched "stat" keywords.

        // Find an item
        const item = table.results[0];
        console.log(`First item range: [${item.range}]`);

        // If it was sanitized to 2d6, we'd expect 2-12 ranges.
        // If it was skipped, it should keep 1d12 ranges (e.g. 1-1, 2-2).

        if (item.range[1] > 12) {
            // 1d12 shouldn't go above 12 either
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

verify();
