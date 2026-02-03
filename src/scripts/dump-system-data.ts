
import { FoundryClient } from '../lib/foundry/client';
import { loadConfig } from '../lib/config';

async function run() {
    console.log('Loading configuration...');
    const config = await loadConfig();
    if (!config) {
        console.error('No configuration found.');
        return;
    }

    const { url, username, password } = config.foundry;

    console.log(`Connecting to Foundry at ${url}...`);

    const client = new FoundryClient({
        url: url,
        headless: true
    });

    try {
        await client.connect();

        // Manual Login
        if (username && client.page) {
            console.log(`Attempting login as ${username}...`);
            try {
                // Wait for select
                await client.page.waitForSelector('select[name="userid"]', { timeout: 10000 });
                await client.page.selectOption('select[name="userid"]', { label: username });
                if (password) {
                    await client.page.fill('input[name="password"]', password);
                }
                await client.page.click('button[name="join"]');
                console.log('Clicked Join...');
            } catch {
                console.log('Login elements not found or already logged in (or no auth needed). Continuing...');
            }
        }

        // Wait longer (20s)
        console.log('Waiting for world to load (20s)...');
        await client.page?.waitForTimeout(20000);

        const systemData = await client.evaluate(() => {
            // @ts-ignore
            const g = window.game;

            // Try to find the system in game.systems collection
            // @ts-ignore
            const systemId = g?.world?.system || 'shadowdark';
            // @ts-ignore
            const systemFromCollection = g?.systems?.get(systemId) || g?.data?.systems?.find((s: any) => s.id === systemId);

            return {
                ready: g?.ready,
                // @ts-ignore
                worldBackground: g?.world?.background,
                // @ts-ignore
                systemId: systemId,
                // @ts-ignore
                system: systemFromCollection ? {
                    id: systemFromCollection.id,
                    title: systemFromCollection.title,
                    // Dump all potential media keys
                    media: systemFromCollection.media,
                    background: systemFromCollection.background,
                    cover: systemFromCollection.cover,
                    img: systemFromCollection.img,
                    poster: systemFromCollection.poster,
                    manifest: systemFromCollection.manifest,
                    download: systemFromCollection.download,
                    // recursive dump of keys just in case
                    keys: Object.keys(systemFromCollection)
                } : 'System Not Found in Collection'
            };
        });

        console.log('--- DUMP OUTPUT ---');
        console.log(JSON.stringify(systemData, null, 2));

    } catch (e) {
        console.error('Error during dump:', e);
    } finally {
        await client.close();
    }
}

run();
