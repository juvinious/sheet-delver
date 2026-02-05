
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { CompendiumCache } from '../../core/foundry/compendium-cache';
import { loadConfig } from '../../core/config';
import { ShadowdarkAdapter } from '../../modules/shadowdark/system';

describe('Compendium Resolution & Pulse Verification', () => {
    let socket: CoreSocket;
    let cache: CompendiumCache;
    let adapter: ShadowdarkAdapter;

    beforeAll(async () => {
        const config = await loadConfig();
        if (!config) throw new Error("Config not found");

        // Initialize CoreSocket (Headless Mode)
        socket = new CoreSocket(config.foundry);
        await socket.connect();

        // Initialize Cache - forcing wait for readiness
        cache = CompendiumCache.getInstance();
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
        adapter = new ShadowdarkAdapter();
    }, 60000); // Allow time for connection & discovery

    afterAll(() => {
        socket.disconnect();
    });

    it('should have standardized UUIDs in the cache', () => {
        const keys = cache.getKeys();
        expect(keys.length).toBeGreaterThan(0);

        // Check if any key includes '.Item.' which we added
        const itemUuid = keys.find(k => k.includes('.Item.')); // e.g. Compendium.shadowdark.ancestries.Item.ID

        console.log('Sample Cache Keys:', keys.slice(0, 5));

        // We expect at least some items to be standardized
        expect(itemUuid).toBeDefined();
        if (itemUuid) {
            expect(itemUuid).toMatch(/^Compendium\.[^.]+\.[^.]+\.Item\.[^.]+$/);
        }
    });

    it('should be able to fetchByUuid via CoreSocket', async () => {
        // Pick a random item from cache to test fetch
        const keys = cache.getKeys();
        const validUuid = keys.find(k => k.includes('shadowdark.ancestries') || k.includes('shadowdark.classes'));

        if (!validUuid) {
            console.warn("Skipping fetchByUuid test - no suitable UUID found in cache");
            return;
        }

        console.log(`Testing fetchByUuid with: ${validUuid}`);
        const doc = await socket.fetchByUuid(validUuid);

        expect(doc).toBeDefined();
        expect(doc.name).toBeDefined();
        expect(doc._id).toBeDefined();
    }, 10000);

    it('should resolve system data using adapter without crashing', async () => {
        // This simulates the call that was crashing (TypeError: fetchByUuid is not a function)
        const systemData = await adapter.getSystemData(socket);

        expect(systemData).toBeDefined();
        expect(systemData.classes).toBeDefined();
        expect(systemData.ancestries).toBeDefined();

        // Check if classes are populated
        if (systemData.classes.length > 0) {
            console.log('Resolved Class:', systemData.classes[0]);
            expect(systemData.classes[0].name).toBeDefined();
            // Languages are fetched via fetchByUuid, so they should be present if logic works
            // Note: Some classes might not have languages, but the field should exist if we fetched doc
            expect(systemData.classes[0].languages).toBeDefined();
        }
    }, 20000);
});
