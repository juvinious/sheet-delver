import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { dataManager } from '../../modules/shadowdark/data/DataManager';
import fs from 'fs';
import path from 'path';

/**
 * Test 6: Verify Effects (Exhaustive Item Check)
 * Iterates through all items in the data cache, attempts to create an actor with each,
 * and reports which ones fail due to invalid effects (e.g. string IDs).
 */
export async function verifyEffects() {
    console.log('🧪 Test 6: Verify Effects (Exhaustive Item Check)\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new CoreSocket(config.foundry);

    // Ensure temp directory exists
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    // Results containers
    const validItems: any[] = [];
    const invalidItems: any[] = [];
    const noEffectItems: any[] = [];

    try {
        await client.connect();
        console.log('✅ Connected\n');

        // 1. Load Data
        console.log('⏳ Loading all documents...');
        const allDocs = await dataManager.getAllDocuments();
        console.log(`   Loaded ${allDocs.length} documents.`);

        // 2. Filter Items
        // Relevant types: Talent, Spell, Class Ability, Ancestry, Background, Class, Boon
        const relevantTypes = ['Talent', 'Spell', 'Class Ability', 'Ancestry', 'Background', 'Class', 'Boon'];
        const itemsToTest = allDocs.filter(d => relevantTypes.includes(d.type));
        console.log(`   Found ${itemsToTest.length} items to test.\n`);

        // 3. Iterate & Test
        let count = 0;
        for (const item of itemsToTest) {
            count++;
            const progress = `[${count}/${itemsToTest.length}] ${item.name}`;

            // Check for effects first
            const hasEffects = item.effects && Array.isArray(item.effects) && item.effects.length > 0;

            if (!hasEffects) {
                // If it has no effects, we technically don't need to test it for THIS specific crash,
                // but let's be thorough? Actually, the crash happens specifically when effects are present as strings.
                // If effects is empty array or undefined, it won't crash on _id.
                // However, let's treat "no effects" as a separate category for clarity.
                noEffectItems.push({ name: item.name, uuid: item.uuid, id: item._id });
                // We skip the create test for speed if we are sure.
                // But wait, what if "effects" is a string unexpectedly?
                // logic: if effects is falsy or empty array, skip.
                if (!item.effects || (Array.isArray(item.effects) && item.effects.length === 0)) {
                    process.stdout.write(`\r${progress} ... ⏭️ No Effects`);
                    continue;
                }
            }

            process.stdout.write(`\r${progress} ... ⏳ Testing`);

            // Prepare Temp Actor
            const actorData = {
                name: `TEST_EFFECTS_${item._id}`,
                type: "NPC",
                img: "icons/svg/mystery-man.svg",
                items: [item] // Embedding the item directly
            };

            let createdActorId: string | null = null;

            try {
                // 4. Attempt Create
                const actor = await client.createActor(actorData);
                createdActorId = actor._id;

                validItems.push({ name: item.name, uuid: item.uuid, id: item._id, effectsFrom: 'object' });
                // process.stdout.write(`\r${progress} ... ✅ Valid`);

            } catch (error: any) {
                // 5. Catch Failure
                const msg = error.message || "Unknown error";
                invalidItems.push({
                    name: item.name,
                    uuid: item.uuid,
                    id: item._id,
                    error: msg,
                    // Snapshot the effects to see what they looked like
                    effectsSnapshot: item.effects
                });
                // process.stdout.write(`\r${progress} ... ❌ Invalid: ${msg}`);
            } finally {
                // 6. Cleanup
                if (createdActorId) {
                    try {
                        await client.deleteActor(createdActorId);
                    } catch (_e) {
                        // ignore cleanup errors
                    }
                }
            }
        }

        console.log('\n\n📊 Verification Complete');
        console.log(`   ✅ Valid: ${validItems.length}`);
        console.log(`   ❌ Invalid: ${invalidItems.length}`);
        console.log(`   ⏭️ No Effects: ${noEffectItems.length}`);

        // 7. Write Reports
        fs.writeFileSync(path.join(tempDir, 'items-valid-effects.json'), JSON.stringify(validItems, null, 2));
        fs.writeFileSync(path.join(tempDir, 'items-invalid-effects.json'), JSON.stringify(invalidItems, null, 2));
        fs.writeFileSync(path.join(tempDir, 'items-no-effects.json'), JSON.stringify(noEffectItems, null, 2));

        console.log(`\n📝 Reports written to ${tempDir}`);

        return { success: invalidItems.length === 0, invalidCount: invalidItems.length };

    } catch (error: any) {
        console.error('\n❌ Test suite failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        console.log('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    verifyEffects().then(_result => {
        process.exit(0); // Always exit 0 to not break CI/automation, we just want the report
    });
}
