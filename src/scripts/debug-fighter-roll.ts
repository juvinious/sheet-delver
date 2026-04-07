
import { CoreSocket } from '@core/foundry/sockets/CoreSocket';
import { loadConfig } from '@core/config';
import { processRollResult } from '../modules/shadowdark/api/level-up-engine';
import { fileURLToPath } from 'url';

const FIGHTER_TABLE_UUID = "Compendium.shadowdark.rollable-tables.RollTable.dExHo4P85MgpwHd9";

export async function debugFighterRoll() {
    logger.info('🚀 Script started...');
    logger.info('🧪 Debug: Fighter (Live Data)\n');

    let client: CoreSocket | undefined;

    try {
        logger.info('📥 Loading config...');
        const configLine = await loadConfig();
        if (!configLine) throw new Error('Failed to load configuration');
        logger.info('✅ Config loaded.');

        const config = configLine.foundry || configLine;
        client = new CoreSocket(config);

        logger.info('📡 Connecting to Foundry...');
        await client.connect();

        logger.info(`fetching table ${FIGHTER_TABLE_UUID}...`);
        const table = await client.fetchByUuid(FIGHTER_TABLE_UUID);
        if (!table) throw new Error("Table not found!");

        logger.info(`🎲 Rolling Table via Socket (Looping for Roll 7-9)...`);

        let rollResult;
        let attempts = 0;
        const minRoll = 7;
        const maxRoll = 9; // Target roll range for "Choose 1"

        while (attempts < 20) {
            attempts++;
            const r = await client.draw(FIGHTER_TABLE_UUID, { displayChat: false });
            if (r.total >= minRoll && r.total <= maxRoll) {
                logger.info(`✅ Hit Target Roll: ${r.total} on attempt ${attempts}`);
                rollResult = r;
                break;
            }
        }

        if (!rollResult) {
            throw new Error(`Failed to hit Roll ${minRoll}-${maxRoll} in ${attempts} attempts`);
        }

        logger.info(`\n🎲 Roll Total: ${rollResult.total}`);
        const matchedResults = rollResult.results;
        logger.info(`Found ${matchedResults.length} matching results.`);

        // Log raw results for inspection
        matchedResults.forEach((r: any, i: number) => {
            logger.info(`[${i}] Text: "${r.text}", Name: "${r.name}", Type: ${r.type}, Keys: ${Object.keys(r).join(', ')}`);
        });

        // Structure for engine (CoreSocket should now populate this fully)
        const engineResult = {
            ...rollResult,
            table: table,
            // CoreSocket hydration should ensure these are populated or at least have names
            items: []
        };

        // Process
        logger.info('\n⚙️  Processing Roll Result...');
        const { choiceOptions, needsChoice } = await processRollResult({
            result: engineResult,
            table: table
        });

        logger.info(`\n📋 Processed Options (${choiceOptions.length}):`);
        choiceOptions.forEach((o: any, i: number) => {
            logger.info(`[${i}] Name: "${o.name}", Text: "${o.text || ''}", ID: ${o._id}`);
        });

        // Validation (Loose check since we don't control the roll total)
        const hasHeader = choiceOptions.some(o => (o.text || "").toLowerCase().includes("choose one") || (o.name || "").toLowerCase().includes("choose one"));
        const hasUnnamed = choiceOptions.some(o => !o.name || o.name === "Unknown Option");

        if (hasHeader) logger.error("❌ FAILED: Header 'Choose one' retained.");
        if (hasUnnamed) logger.error("❌ FAILED: Option with no name found.");

        if (!hasHeader && !hasUnnamed) {
            logger.info("\n✅ Verification Passed: Options look clean (if there were options).");
            return { success: true };
        } else {
            logger.info("\n❌ Verification Failed.");
            return { success: false };
        }

    } catch (error: any) {
        logger.error('❌ Error:', error.message);
        return { success: false, error: error.message };
    } finally {
        if (client) {
            await client.disconnect();
            logger.info('\n📡 Disconnected');
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    debugFighterRoll().then(r => process.exit(r.success ? 0 : 1));
}
