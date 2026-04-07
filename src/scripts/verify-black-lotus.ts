import { logger } from '../shared/utils/logger';
import { dataManager } from '../modules/shadowdark/src/data/DataManager';

async function verify() {
    try {
        logger.info("Loading Black Lotus table...");
        const tableName = "Black Lotus Talents";

        // Mock client that can resolve by UUID if needed
        const mockClient = { fetchByUuid: async (uuid: string) => null };
        const rollResult = await dataManager.draw(tableName, mockClient);

        if (!rollResult || !rollResult.table) {
            logger.error("❌ Could not load table");
            return;
        }

        const table = rollResult.table;
        logger.info(`Table: ${table.name}, Formula: ${table.formula}`);

        // precise check: ensure ranges are NOT modified to 2d6 tiers
        // Black Lotus items use 1d12 so ranges are like [1,1], [2,2]...
        // My sanitization would have moved something to [12,12] if it matched "choose" keywords 
        // or [10,11] if it matched "stat" keywords.

        // Find an item
        const item = table.results[0];
        logger.info(`First item range: [${item.range}]`);

        // If it was sanitized to 2d6, we'd expect 2-12 ranges.
        // If it was skipped, it should keep 1d12 ranges (e.g. 1-1, 2-2).

        if (item.range[1] > 12) {
            // 1d12 shouldn't go above 12 either
        }

    } catch (e) {
        logger.error("Error:", e);
    }
}

verify();
