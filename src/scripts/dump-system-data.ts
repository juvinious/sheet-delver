
import { createFoundryClient } from '../core/foundry';
import { loadConfig } from '../core/config';

async function run() {
    console.log('Loading configuration...');
    const config = await loadConfig();
    if (!config) {
        console.error('No configuration found.');
        return;
    }

    const { url, username, password } = config.foundry;

    console.log(`Connecting to Foundry at ${url}...`);

    const client = createFoundryClient({
        url: url
    });

    try {
        await client.connect();

        // Manual Login
        if (username) {
            console.log(`Attempting login as ${username}...`);
            try {
                await client.login(username, password);
                console.log('Logged in...');
            } catch (e: any) {
                console.warn(`Login failed or already logged in: ${e.message}`);
            }
        }

        // Wait to ensure systems are ready?
        // Socket login usually waits for Hook 'ready', so extra wait might be redundant but safe
        console.log('Waiting for world sync (5s)...');
        await new Promise(resolve => setTimeout(resolve, 5000));

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
        client.disconnect();
    }
}

run();
