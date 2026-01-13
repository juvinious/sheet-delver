import { FoundryClient } from '../lib/foundry/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file, fallback to default for this specific user case
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    // Hardcoded for this specific inspection task if envs are missing
    const url = process.env.FOUNDRY_URL || 'https://foundry.juvi.dev';

    console.log(`Connecting to ${url}...`);

    const client = new FoundryClient({
        url,
        headless: true
    });

    try {
        await client.connect();

        // We need to login as the user to see their specific actor
        // We'll scrape users first to see who to log in as, or just ask the user.
        // For now, let's try to get the list of users and log in as the first non-GM if possible,
        // or just list the data from the login screen if we can (we can't).

        // Actually, I'll just login with the credentials if I have them, or prompted.
        // Since I don't know the user's specific login, I'll rely on the script scraping the user list 
        // and logging in as the first available user that isn't GM, or just pick one.

        const users = await client.getUsers();
        console.log('Available users:', users.map(u => u.name).join(', '));

        if (users.length === 0) {
            console.log('No users found or auto-login enabled.');
            // Try manual login if we know the user is there but scraped nothing?
            await client.login('arnstr', '0910');
        } else {
            // Log in as arnstr if present, or fallback
            const player = users.find(u => u.name === 'arnstr') || users.find(u => u.name !== 'Gamemaster') || users[0];
            console.log(`Logging in as ${player.name}...`);
            await client.login(player.name, '0910');
        }

        console.log('Waiting for board...');

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
