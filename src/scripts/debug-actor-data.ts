
import { FoundryClient } from '../lib/foundry/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';

dotenv.config();

async function loadConfig() {
    try {
        const configPath = path.resolve(process.cwd(), 'settings.yaml');
        const fileContents = await fs.readFile(configPath, 'utf8');
        const doc = yaml.load(fileContents) as any;

        if (doc && doc.foundry) {
            return {
                url: `${doc.foundry.protocol}://${doc.foundry.host}:${doc.foundry.port}`,
                username: doc.foundry.username,
                password: doc.foundry.password,
                headless: doc.foundry.headless
            };
        }
    } catch (e) {
        console.error('Failed to load config', e);
        return null;
    }
    return null;
}

async function run() {
    const config = await loadConfig();
    const client = new FoundryClient(config!);
    await client.connect();
    await client.login();

    // Get first actor
    const actors = await client.getActors();
    if (actors.length > 0) {
        const actor = await client.getActor(actors[0].id);
        if (!actor) {
            console.log('Actor not found');
            await client.close();
            return;
        }
        console.log('Actor Name:', actor.name);
        console.log('System Data Keys:', Object.keys(actor.system));
        // Check languages and deity specially for Shadowdark
        console.log('Languages:', JSON.stringify(actor.system.languages, null, 2));
        console.log('Deity:', actor.system.deity);

        // Also check if any other fields look like Compendium links
        console.log('Full System Dump (first level):');
        for (const key in actor.system) {
            const val = actor.system[key];
            if (typeof val === 'string' && val.startsWith('Compendium')) {
                console.log(`${key}: ${val}`);
            }
        }
    } else {
        console.log('No actors found');
    }

    await client.close();
}

run();
