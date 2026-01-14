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
    if (!config) {
        console.error('No config found');
        return;
    }

    const client = new FoundryClient(config);
    try {
        await client.connect();
        await client.login();

        await client['page']?.waitForFunction(() => (window as any).game && (window as any).game.packs.size > 0, null, { timeout: 10000 });

        const packs = await client['page']?.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const result = [];

            for (const p of packs) {
                // We need to load the index if it's not loaded, but typically we can request it
                // @ts-ignore
                const index = await p.getIndex();
                result.push({
                    collection: p.collection,
                    title: p.title,
                    // @ts-ignore
                    index: index.map(i => ({ _id: i._id, name: i.name }))
                });
            }
            return result;
        });

        console.log(JSON.stringify(packs, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
