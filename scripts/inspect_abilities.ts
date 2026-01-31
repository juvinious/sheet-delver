
import { getClient } from '../src/lib/foundry/instance';
//import { logger } from '../src/lib/logger';

async function main() {
    const client = getClient();
    if (!client) return;
    await client.connect();

    // Get the first actor to inspect
    const actors = await client.getActors();
    if (actors.length > 0) {
        const actorId = actors[0].id; // Use the first available actor
        console.log(`Inspecting Actor: ${actors[0].name} (${actorId})`);

        const actor = await client.getActor(actorId);
        if (actor && actor.system && actor.system.abilities) {
            console.log('Abilities Structure:', JSON.stringify(actor.system.abilities, null, 2));
        } else {
            console.log('No abilities found on actor system data.');
            console.log('Full System Data:', JSON.stringify(actor?.system, null, 2));
        }
    } else {
        console.log('No actors found.');
    }

    await client.close();
}

main().catch(console.error);
