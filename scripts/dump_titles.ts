
import { FoundryClient } from '@/lib/foundry/client';
import { loadConfig } from '@/lib/config';

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
            if (!pack) return { error: 'Pack shadowdark.classes not found' };
            await pack.getIndex();

            // @ts-ignore
            const index = pack.index.filter(i => i.type === 'Class');
            const result: any = {};

            for (const i of index) {
                // @ts-ignore
                const doc = await pack.getDocument(i._id);
                // @ts-ignore
                result[i.name] = doc.system.titles || 'No Titles Found';
            }
            return result;
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
