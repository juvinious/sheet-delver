/**
 * Debug script to test notes update flow
 * Run with: npx ts-node src/scripts/test-notes-update.ts
 */

import { FoundryClient } from '../lib/foundry/client';
import { loadConfig } from '../lib/config';

async function testNotesUpdate() {
    const config = await loadConfig();
    if (!config) {
        console.error('Failed to load config');
        return;
    }

    const client = new FoundryClient({
        url: config.foundry.url,
        username: config.debug.foundryUser?.name,
        password: config.debug.foundryUser?.password,
        headless: !config.debug.enabled
    });

    try {
        console.log('Connecting to Foundry...');
        await client.connect();
        await client.login();

        console.log('Fetching actors...');
        const actors = await client.getActors();

        if (actors.length === 0) {
            console.log('No actors found');
            return;
        }

        const actor = actors[0];
        console.log(`\nTesting with actor: ${actor.name} (${actor.id})`);

        // Get current notes
        const fullActor = await client.getActor(actor.id);
        if (!fullActor) {
            console.log('Failed to fetch full actor');
            return;
        }

        console.log('\nCurrent notes structure:');
        console.log('system.details.notes:', fullActor.system?.details?.notes);
        console.log('system.notes:', fullActor.system?.notes);
        console.log('system.details.biography:', fullActor.system?.details?.biography);

        // Test update
        const testContent = `<p>Test update at ${new Date().toISOString()}</p>`;
        console.log('\nAttempting to update notes with:', testContent);

        const result = await client.updateActor(actor.id, {
            'system.details.notes.value': testContent
        });

        console.log('Update result:', result);

        // Verify update
        const updatedActor = await client.getActor(actor.id);
        if (!updatedActor) {
            console.log('Failed to fetch updated actor');
            return;
        }

        console.log('\nAfter update:');
        console.log('system.details.notes:', updatedActor.system?.details?.notes);

        if (updatedActor.system?.details?.notes?.value === testContent) {
            console.log('✅ Notes update successful!');
        } else {
            console.log('❌ Notes update failed - value mismatch');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

testNotesUpdate();
