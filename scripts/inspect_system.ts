// @ts-nocheck
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const settings = yaml.load(fs.readFileSync(path.join(process.cwd(), 'settings.yaml'), 'utf8'));

(async () => {
    // Correct Launch Args for Headless Foundry
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    const f = settings.foundry;
    const url = `${f.protocol}://${f.host}:${f.port}`;
    const user = settings.config.debug.foundryUser;

    try {
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle' });

        // Login
        const isLoggedIn = await page.locator('#board').isVisible().catch(() => false);
        if (!isLoggedIn) {
            console.log('Logging in...');
            // Select User
            const userSelect = page.locator('select[name="userid"]');
            if (await userSelect.isVisible()) {
                await userSelect.selectOption({ label: user.name });
            }
            // Enter Password
            await page.fill('input[name="password"]', user.password);
            await page.click('button[name="join"]');

            console.log('Waiting 10s for Game Ready...');
            await new Promise(r => setTimeout(r, 10000));
        }

        console.log('Inspecting Data...');
        const data = await page.evaluate(async () => {
            const game = window.game;
            if (!game) return { error: 'window.game is undefined' };
            if (!game.ready) console.warn('Game not fully ready yet');

            // Find Actor
            const actors = game.actors;
            const actor = actors ? actors.contents[0] : null;

            if (!actor) {
                return {
                    error: 'No actor found',
                    actorCount: actors ? actors.size : 'N/A',
                    gameKeys: Object.keys(game)
                };
            }

            const s = actor.system;
            const items = actor.items.contents.map(i => ({
                id: i.id,
                name: i.name,
                type: i.type,
                system: i.system,
                flags: i.flags
            }));

            const classItem = items.find(i => i.type === 'Class' || i.type === 'class');
            const ancestryItem = items.find(i => i.type === 'Ancestry' || i.type === 'ancestry');

            // Helper to recursively find keys with "lang"
            const findLangKeys = (obj, prefix = '') => {
                let keys = [];
                for (const k in obj) {
                    if (k.toLowerCase().includes('lang')) keys.push(prefix + k);
                    if (typeof obj[k] === 'object' && obj[k] !== null && prefix.length < 20) {
                        // keys = keys.concat(findLangKeys(obj[k], prefix + k + '.'));
                        // limit recursion for sanity
                    }
                }
                return keys;
            };

            // Fetch Language Details
            // Found UUIDs: Compendium.shadowdark.languages.Item.DQzHvoMWSZ0eiRWP (Common usually)

            // We can't use fromUuid in evaluate easily without fully loaded mapping, 
            // but we can try to look in the packs if available.

            const pack = game.packs.get("shadowdark.languages");
            let languageSample = null;
            if (pack) {
                // Try to get the first index or document
                const index = await pack.getIndex();
                const firstEntry = index.contents[0];
                if (firstEntry) {
                    const doc = await pack.getDocument(firstEntry._id);
                    languageSample = doc ? {
                        name: doc.name,
                        system: doc.system,
                        flags: doc.flags
                    } : 'Doc load failed';
                }
            }

            // Search for Wizard Class in Compendiums
            let wizardData = null;
            for (const pack of game.packs) {
                if (pack.documentName !== 'Item') continue;
                await pack.getIndex();
                const entry = pack.index.find(i => i.name === 'Wizard' && i.type === 'Class');
                if (entry) {
                    const doc = await pack.getDocument(entry._id);
                    wizardData = {
                        name: doc.name,
                        pack: pack.collection,
                        languagesType: typeof doc.system?.languages,
                        isArray: Array.isArray(doc.system?.languages),
                        languages: doc.system?.languages
                    };
                    break;
                }
            }

            // Search for Weapons
            const weapons = items.filter(i => i.type === 'Weapon').map(w => ({
                name: w.name,
                system: w.system,
                type: w.type
            }));

            return {
                actorName: actor.name,
                weapons: weapons,
                wizardClassSample: wizardData,
                languageSample: languageSample,
                'actor.system.languages': s.languages
            };
        });

        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
        process.exit();
    }
})();
