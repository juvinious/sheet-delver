
import { FoundryClient } from '@/core/foundry/client';
import { loadConfig } from '@/core/config';

async function run() {
    const config = await loadConfig();
    if (!config) throw new Error("Config not loaded");
    const { url } = config.foundry;
    const client = new FoundryClient({ url, headless: true });

    try {
        await client.connect();
        if (config.config.debug.foundryUser?.name) {
            await client.login(config.config.debug.foundryUser.name, config.config.debug.foundryUser.password);
        }
        await client.waitForFunction(() => (window as any).game && (window as any).game.ready);

        const titles = await client.evaluate(async () => {
            // @ts-ignore
            const pack = window.game.packs.get('shadowdark.classes');
            await pack.getIndex();

            const results: any = {};
            const targetClasses = ['Wizard', 'Priest'];

            for (const cls of targetClasses) {
                // @ts-ignore
                const index = pack.index.find(i => i.name === cls);
                if (index) {
                    // @ts-ignore
                    const doc = await pack.getDocument(index._id);
                    results[cls] = doc.system.titles;
                }
            }
            return results;
        });

        console.log(JSON.stringify(titles, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
        process.exit();
    }
}
run();
