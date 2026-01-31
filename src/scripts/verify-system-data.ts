import { ShadowdarkAdapter } from '../modules/shadowdark/system';
import { FoundryClient } from '../lib/foundry/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';

dotenv.config();

// Mock Client-like object or use real client
// We need a real client to connect to Foundry
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
        console.error("No config");
        return;
    }

    const client = new FoundryClient(config);
    try {
        await client.connect();
        await client.login();

        const adapter = new ShadowdarkAdapter();
        console.log("Fetching System Data...");
        const data = await adapter.getSystemData(client);

        console.log("--- PATRONS ---");
        // @ts-ignore
        console.log(data.patrons.map(p => `${p.name} (${p.uuid})`));

        console.log("--- DEITIES ---");
        // @ts-ignore
        console.log(data.deities.map(d => `${d.name} (${d.uuid})`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
