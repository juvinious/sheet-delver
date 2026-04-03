import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { logger } from '../../core/logger';
import fs from 'fs';
import path from 'path';

async function runDiagnostic() {
    // 1. Initialize Configuration
    const config = await loadConfig();
    if (!config || !config.foundry) {
        logger.error("Failed to load configuration. Check your .env file.");
        return;
    }
    
    // 2. Initialize Socket and Connect (Handles handshake/login internally)
    const socket = new CoreSocket(config.foundry);
    logger.info("📡 Connecting to Foundry VTT...");
    
    try {
        await socket.connect();
        logger.info("✅ Connected successfully!");
        
        // 3. Verify System Version
        const system = await socket.getSystem();
        logger.info(`System Detected: ${system.id} v${system.version}`);
        
        if (system.id !== 'shadowdark') {
            logger.warn(`Current world system is '${system.id}', not 'shadowdark'. Results may vary.`);
        }

        // 4. Load Mapping
        const mappingPath = path.join(process.cwd(), 'src/modules/shadowdark/data/shadowdarkling/map-shadowdarkling.json');
        if (!fs.existsSync(mappingPath)) {
            logger.error(`Mapping file not found at: ${mappingPath}`);
            return;
        }
        const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

        // Test sample UUIDs (Normalized to 4-part as per Shadowdark v3.x)
        const testUuids = [
            "Compendium.shadowdark.talents.FIHNdRhD6DHFxSkC", // AddWISToRolls
            "Compendium.shadowdark.ancestries.0lJ8Pj0UPsbSSUTm", // Half-Orc
            "Compendium.shadowdark.gear.DeqtKQQzI6HTYvV0" // Chainmail
        ];

        logger.info("--- Testing UUID Formats ---");
        for (const uuid of testUuids) {
            logger.info(`Fetching: ${uuid}...`);
            try {
                const doc = await socket.fetchByUuid(uuid);
                if (doc) {
                    logger.info(`  SUCCESS: Found '${doc.name}' (${doc.type}) via ${uuid}`);
                } else {
                    logger.warn(`  FAILED: Document not found via ${uuid}`);
                    
                    // Fallback check: Does the legacy format work?
                    const parts = uuid.split('.');
                    const legacyUuid = `Compendium.${parts[1]}.${parts[2]}.Item.${parts[3]}`;
                    logger.info(`  RETRYING Legacy Format: ${legacyUuid}...`);
                    const legacyDoc = await socket.fetchByUuid(legacyUuid);
                    if (legacyDoc) {
                        logger.info(`  SUCCESS (Legacy): Found '${legacyDoc.name}' via ${legacyUuid}`);
                    }
                }
            } catch (e) {
                logger.error(`  ERROR fetching ${uuid}: ${e}`);
            }
        }

        // 5. Discover All Item Compendiums
        logger.info("--- Discovering Compendiums via ShadowdarkDiscovery ---");
        const { ShadowdarkDiscovery } = await import('../../modules/shadowdark/discovery');
        const data = await ShadowdarkDiscovery.getSystemData(socket);
        
        logger.info(`Discovery complete. Found ${data.ancestries?.length || 0} ancestries and ${data.items?.length || 0} gear items.`);
        
        if (data.items && data.items.length > 0) {
            const first = data.items[0];
            logger.info(`Example Item Discovery: ${first.name} -> UUID: ${first.uuid}`);
            if (first.uuid && first.uuid.split('.').length === 4) {
                logger.info("  [VERIFIED] Discovery is generating 4-part UUIDs.");
            } else {
                logger.warn(`  [WARNING] Discovery generated a ${first.uuid.split('.').length}-part UUID: ${first.uuid}`);
            }
        }

        // 6. Check Cache Naming
        const cacheDir = path.join(process.cwd(), '.data', 'cache', 'shadowdark');
        if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            const systemDataFile = files.find(f => f.startsWith('system-data-v.'));
            if (systemDataFile) {
                logger.info(`  [VERIFIED] System data cache exists: ${systemDataFile}`);
            } else {
                logger.warn("  [WARNING] No system data cache found matching the new naming convention.");
            }
        }

    } catch (e) {
        logger.error(`  ERROR during diagnostic: ${e}`);
    } finally {
        await socket.disconnect();
        logger.info("📡 Disconnected");
    }
}

runDiagnostic().catch(console.error);
