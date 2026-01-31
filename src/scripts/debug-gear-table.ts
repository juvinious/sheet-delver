
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
        console.error("No config");
        return;
    }

    const client = new FoundryClient(config);
    try {
        await client.connect();
        await client.login();

        const uuid = "Compendium.shadowdark.rollable-tables.RollTable.WKVfMaGkoXe3DGub";
        console.log(`Fetching table: ${uuid}`);

        const tableData = await client['page'].evaluate(async (uuid) => {
            // @ts-ignore
            const doc = await fromUuid(uuid);
            if (!doc) return null;
            // @ts-ignore
            return {
                name: doc.name,
                formula: doc.formula,
                description: doc.description,
                results: doc.results.map((r: any) => ({
                    text: r.text,
                    range: r.range,
                    documentCollection: r.documentCollection,
                    documentId: r.documentId
                }))
            };
        }, uuid);

        if (tableData) {
            console.log("Table Name:", tableData.name);
            console.log("Formula:", tableData.formula);
            console.log("Results Count:", tableData.results.length);
            console.log("Results Sample:", JSON.stringify(tableData.results, null, 2));
        } else {
            console.log("Table not found via fromUuid in browser context.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
