
import { FoundryClient } from '../src/lib/foundry/client.ts';
import { loadConfig } from '../src/lib/config.ts';

async function main() {
    const config = await loadConfig();
    if (!config) return;

    const client = new FoundryClient(config.foundry);
    try {
        await client.connect();

        // Login if needed (usually auto-login if configured, or session persistence)
        // Check local storage or try to access actors directly.
        // Assuming we need to visit the page or evaluate directly if we can access the game object.

        // Wait for game ready
        await client.page?.waitForFunction(() => (window as any).game?.ready);

        const items = await client.page?.evaluate(() => {
            // Get first Shadowdark actor
            // @ts-ignore
            const actor = window.game.actors.find(a => a.type === 'Player');
            if (!actor) return 'No Player actor found';

            return actor.items.map((i: any) => ({
                id: i.id,
                name: i.name,
                type: i.type,
                system: i.system
            }));
        });

        console.log('Actor Items:', JSON.stringify(items, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        if (client.browser) await client.browser.close();
    }
}

main();
