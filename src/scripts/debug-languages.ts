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

        await client['page']?.waitForFunction(() => (window as any).game && (window as any).game.packs.size > 0, null, { timeout: 10000 });

        const data = await client['page']?.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results: any = { ancestry: null, class: null };

            for (const pack of packs) {
                // @ts-ignore
                if (pack.documentName !== 'Item') continue;

                // Find an Ancestry (e.g. Elf)
                if (!results.ancestry) {
                    // @ts-ignore
                    const index = await pack.getIndex({ fields: ['type'] });
                    const elf = index.find((i: any) => i.name === 'Elf' && i.type === 'Ancestry');
                    if (elf) {
                        // @ts-ignore
                        const doc = await pack.getDocument(elf._id);
                        results.ancestry = { name: doc.name, languages: doc.system.languages };
                    }
                }

                // Find a Class (e.g. Wizard or Cleric)
                if (!results.class) {
                    // @ts-ignore
                    const index = await pack.getIndex({ fields: ['type'] });
                    // Wizard usually has choices
                    const wizard = index.find((i: any) => i.name === 'Wizard' && i.type === 'Class');
                    if (wizard) {
                        // @ts-ignore
                        const doc = await pack.getDocument(wizard._id);

                        // Also check Cleric
                        results.class = { name: doc.name, languages: doc.system.languages };
                    }
                }
            }
            return results;
        });

        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
