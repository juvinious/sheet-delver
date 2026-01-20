
import { getClient } from '../lib/foundry/instance.ts';
import { loadConfig } from '../lib/config.ts';

async function main() {
    await loadConfig();
    const client = getClient();
    if (!client) {
        console.error('Failed to initialize client');
        return;
    }
    await client.connect();

    // Get the first actor
    const actors = await client.getActors();
    if (actors.length === 0) {
        console.log('No actors found.');
        return;
    }

    const actor = actors[0];
    console.log(`Inspecting Actor: ${actor.name}`);

    // Find weapons
    const weapons = actor.items.filter((i: any) => i.type === 'Weapon');
    console.log(`Found ${weapons.length} weapons.`);

    weapons.forEach((w: any) => {
        console.log(`\nWeapon: ${w.name}`);
        console.log('Properties:', JSON.stringify(w.system.properties, null, 2));
    });
}

main().catch(console.error);
