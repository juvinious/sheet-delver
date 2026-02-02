
import { FoundryClient } from '../src/lib/foundry/client';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const settings = yaml.load(fs.readFileSync(path.join(process.cwd(), 'settings.yaml'), 'utf8')) as any;

(async () => {
    const client = new FoundryClient(settings.foundryUrl);
    await client.login(settings.foundryUser.username, settings.foundryUser.password);

    if (!client.page) throw new Error("Client page not initialized");

    const data = await client.page.evaluate(async () => {
        // @ts-ignore
        const actor = game.actors.contents[0]; // Assuming first actor is the target
        if (!actor) return 'No actor found';

        const s = actor.system;
        const items = actor.items.contents.map((i: any) => ({
            name: i.name,
            type: i.type,
            system: i.system
        }));

        const classItem = items.find((i: any) => i.type === 'Class');
        const ancestryItem = items.find((i: any) => i.type === 'Ancestry');

        return {
            actorLanguages: s.languages,
            classItem: classItem ? {
                name: classItem.name,
                languages: classItem.system.languages,
                fullSystem: classItem.system
            } : 'No Class Found',
            ancestryItem: ancestryItem ? {
                name: ancestryItem.name,
                languages: ancestryItem.system.languages
            } : 'No Ancestry Found'
        };
    });

    console.log(JSON.stringify(data, null, 2));
    if (client.browser) await client.browser.close();
})();
