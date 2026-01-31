import { FoundryClient } from '../lib/foundry/client';
import { loadConfig } from '../lib/config';

async function main() {
    console.log('Loading configuration...');
    const config = await loadConfig();

    // Fallback URL if config fails or is missing (safer default)
    const url = config?.foundry?.url || process.env.FOUNDRY_URL || 'http://localhost:30000';
    const { name: username, password } = config?.debug?.foundryUser || {};

    console.log(`Connecting to ${url}...`);

    const client = new FoundryClient({
        url,
        headless: true
    });

    try {
        await client.connect();

        // Login Logic
        const users = await client.getUsers();
        console.log('Available users:', users.map(u => u.name).join(', '));

        if (username) {
            console.log(`Attempting login as configured user: ${username}...`);
            // Determine if user exists in the list
            const userExists = users.some(u => u.name === username);
            if (userExists) {
                await client.login(username, password);
            } else {
                console.warn(`Configured user '${username}' not found in world. Trying auto-selection...`);
                // Fallback to first available non-GM user
                const player = users.find(u => u.name !== 'Gamemaster') || users[0];
                if (player) {
                    console.log(`Logging in as ${player.name}... (No password provided for auto-selected user)`);
                    await client.login(player.name);
                }
            }
        } else if (users.length > 0) {
            // No config, try best guess
            const player = users.find(u => u.name !== 'Gamemaster') || users[0];
            console.log(`Logging in as ${player.name}...`);
            await client.login(player.name);
        } else {
            console.log('No users found. Login might have failed or world is stopped.');
        }

        console.log('Waiting for board...');

        // Wait for board or timeout
        try {
            await client.page?.waitForFunction(() => (window as any).game && (window as any).game.ready, null, { timeout: 10000 });
        } catch {
            console.log('Timeout waiting for game.ready. Might be in Setup or stuck.');
        }

        // Get System Info
        const system = await client.getSystem();
        console.log('System:', system);

        // Get Actors
        const actors = await client.getActors(); // These are summaries
        console.log(`Found ${actors.length} actors.`);

        if (actors.length > 0) {
            // Fetch full data for the first one
            const fullActor = await client.getActor(actors[0].id);
            console.log(JSON.stringify(fullActor, null, 2));
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await client.close();
    }
}

main();

