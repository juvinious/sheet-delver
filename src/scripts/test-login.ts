import { FoundryClient } from '../lib/foundry/client';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    const url = process.env.FOUNDRY_URL;
    const username = process.env.FOUNDRY_USERNAME;
    const password = process.env.FOUNDRY_PASSWORD;

    if (!url) {
        console.error('Error: FOUNDRY_URL is not defined in .env');
        process.exit(1);
    }

    console.log(`Connecting to ${url}...`);

    const client = new FoundryClient({
        url,
        username,
        password,
        headless: false // Run in headful mode so we can see what happens
    });

    try {
        await client.connect();
        console.log('Connected to page.');

        await client.login();
        console.log('Login sequence completed (or skipped if already logged in).');

        console.log('Fetching actors...');
        const actors = await client.getActors();
        console.log(`Found ${actors.length} actors:`);
        actors.forEach((a: any) => console.log(`- ${a.name} (${a.type})`));

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        // Keep open for a bit to inspect
        await new Promise(r => setTimeout(r, 5000));
        await client.close();
    }
}

main();
