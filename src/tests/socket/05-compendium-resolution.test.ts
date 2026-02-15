
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { CompendiumCache } from '../../core/foundry/compendium-cache';
import { loadConfig } from '../../core/config';
import { ShadowdarkAdapter } from '../../modules/shadowdark/system';
import { fileURLToPath } from 'url';

export async function testCompendiumResolution() {
    console.log('🧪 Test 5 (Alt): Compendium Resolution & Pulse Verification\n');

    const configLine = await loadConfig();
    if (!configLine) throw new Error("Config not found");
    const config = configLine.foundry || configLine;

    // Initialize CoreSocket (Headless Mode)
    const socket = new CoreSocket(config);
    try {
        await socket.connect();

        // Initialize Cache - forcing wait for readiness
        const cache = CompendiumCache.getInstance();
        await cache.initialize(socket);

        // Wait for cache to actually load if it takes time
        if (!cache.hasLoaded()) {
            await new Promise<void>(resolve => {
                const check = setInterval(() => {
                    if (cache.hasLoaded()) {
                        clearInterval(check);
                        resolve();
                    }
                }, 500);
            });
        }

        // Initialize Adapter
        const adapter = new ShadowdarkAdapter();

        // 1. Check Standardized UUIDs
        console.log('--- Part 1: Standardized UUIDs ---');
        const keys = cache.getKeys();
        if (keys.length === 0) throw new Error('Cache is empty');

        const itemUuid = keys.find(k => k.includes('.Item.'));
        console.log('Sample Cache Keys:', keys.slice(0, 5));

        if (!itemUuid) throw new Error('No standardized Item UUIDs found in cache');
        if (!itemUuid.match(/^Compendium\.[^.]+\.[^.]+\.Item\.[^.]+$/)) {
            throw new Error(`UUID ${itemUuid} does not match expected pattern`);
        }
        console.log('✅ Standardized UUIDs Verified');

        // 2. Fetch By UUID
        console.log('\n--- Part 2: Fetch By UUID ---');
        const validUuid = keys.find(k => k.includes('shadowdark.ancestries') || k.includes('shadowdark.classes'));
        if (!validUuid) {
            console.warn("Skipping fetchByUuid test - no suitable UUID found in cache");
        } else {
            console.log(`Testing fetchByUuid with: ${validUuid}`);
            const doc = await socket.fetchByUuid(validUuid);
            if (!doc || !doc.name || !doc._id) {
                throw new Error(`fetchByUuid failed for ${validUuid}`);
            }
            console.log(`✅ Fetch Verified: ${doc.name}`);
        }

        // 3. System Data Resolution
        console.log('\n--- Part 3: System Data Resolution ---');
        const systemData = await adapter.getSystemData(socket);
        if (!systemData || !systemData.classes || !systemData.ancestries) {
            throw new Error('System data resolution failed - missing fields');
        }

        if (systemData.classes.length > 0) {
            console.log('Resolved Class:', systemData.classes[0].name);
            if (!systemData.classes[0].system?.languages && !systemData.classes[0].languages) {
                throw new Error('Class languages field missing');
            }
        }
        console.log('✅ System Data Resolution Verified');

        return { success: true };
    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        socket.disconnect();
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testCompendiumResolution().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
