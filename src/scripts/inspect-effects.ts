
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
                username: doc.debug?.foundryUser?.name,
                password: doc.debug?.foundryUser?.password,
                headless: !doc.debug?.enabled
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

        console.log('--- Effects Dump ---');
        console.log(JSON.stringify(actor.effects, null, 2));

        console.log('--- System Conditions Dump ---');
        // Check wherever conditions might be
        console.log('system.conditions:', JSON.stringify(actor.system.conditions, null, 2));
        console.log('system.effects:', JSON.stringify(actor.system.effects, null, 2));

    } else {
        console.log('No actors found');
    }

    await client.close();
}

run();
