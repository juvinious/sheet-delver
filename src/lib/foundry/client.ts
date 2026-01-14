import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import { FoundryConfig } from './types';

export class FoundryClient {
    public browser: Browser | null = null;
    public context: BrowserContext | null = null;
    public page: Page | null = null;
    private config: FoundryConfig;

    constructor(config: FoundryConfig) {
        this.config = config;
    }

    get isConnected(): boolean {
        return !!this.page && !this.page.isClosed();
    }

    get url(): string {
        return this.config.url;
    }

    async connect() {
        if (this.browser) return;

        this.browser = await chromium.launch({
            headless: this.config.headless ?? true,
            // Add args if needed for WebGL/Canvas support in headless
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();

        console.log(`Navigating to ${this.config.url}...`);
        await this.page.goto(this.config.url, { waitUntil: 'networkidle' });
    }

    async getUsers() {
        if (!this.page) throw new Error('Not connected');

        // Wait for the select element to be visible (implies we are on the login screen)
        // If we are already logged in, this will timeout or fail, so we should check for that.
        const isLoggedIn = await this.page.locator('#board').isVisible().catch(() => false);
        if (isLoggedIn) return [];

        try {
            await this.page.waitForSelector('select[name="userid"]', { timeout: 5000 });
            const options = await this.page.$$eval('select[name="userid"] option', (els) => {
                return els.map(el => ({
                    id: el.getAttribute('value'),
                    name: el.textContent || ''
                })).filter(u => u.id !== ''); // Filter out empty default if any
            });
            return options;
        } catch (e) {
            console.warn('Could not find user select list', e);
            return [];
        }
    }

    async login(username?: string, password?: string) {
        if (!this.page) throw new Error('Not connected');

        // Check if we are already logged in
        const isLoggedIn = await this.page.locator('#board').isVisible().catch(() => false);
        if (isLoggedIn) {
            console.log('Already logged in');
            return;
        }

        const targetUsername = username || this.config.username;
        const targetPassword = password || this.config.password;

        if (targetUsername) {
            const userSelect = this.page.locator('select[name="userid"]');
            if (await userSelect.isVisible()) {
                await userSelect.selectOption({ label: targetUsername });
            }
        }

        if (targetPassword) {
            await this.page.fill('input[name="password"]', targetPassword);
        }

        await this.page.click('button[name="join"]');
        // Wait for board to load or game to be ready
        // #board might not exist in all systems/modules immediately, but game.ready is the source of truth
        await this.page.waitForFunction(() => (window as any).game && (window as any).game.ready, null, { timeout: 60000 });
    }

    async getSystem(): Promise<{ id: string; title: string; version: string; background?: string; isLoggedIn?: boolean }> {
        if (!this.page) throw new Error('Not connected');

        return await this.page.evaluate(() => {
            // @ts-ignore
            const game = window.game;
            // 1. Try standard game.system (logged in)
            let s = game?.system;
            // 2. Try game.data.system (older versions or specific contexts)
            if (!s?.id) s = game?.data?.system;
            // 3. Try game.world.system (sometimes available on login screen)
            if (!s?.id && game?.world?.system) {
                // game.world.system often looks like "dnd5e" (string) or an object
                const ws = game.world.system;
                if (typeof ws === 'string') {
                    // If it's just a string ID, we might not get title/version easily, but ID is most important so we default others
                    s = { id: ws, title: ws, version: '0.0.0' };
                } else {
                    s = ws;
                }
            }

            // Extract generic background
            let bg = game?.world?.background; // Official world background
            if (!bg) {
                // Fallback to scraping CSS if on login screen
                // The login screen usually has a background on .main or body
                const bodyStyle = window.getComputedStyle(document.body);
                const bgImage = bodyStyle.backgroundImage;
                if (bgImage && bgImage !== 'none') {
                    // Extract url("...") -> ...
                    const match = bgImage.match(/url\((['"]?)(.*?)\1\)/);
                    if (match) bg = match[2];
                }
            }

            if (s && (s.id || s._id)) {
                return {
                    id: s.id || s._id,
                    title: s.title || 'Unknown',
                    version: s.version || '0.0.0',
                    background: bg,
                    // @ts-ignore
                    isLoggedIn: !!(window.game && window.game.user)
                };
            }

            return {
                id: 'unknown',
                title: 'Unknown',
                version: '0.0.0',
                background: bg,
                // @ts-ignore
                isLoggedIn: !!(window.game && window.game.user)
            };
        });
    }

    async getActors() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        // Execute script in browser context to get data from the global 'game' object
        // This is the most reliable way vs scraping HTML
        return await this.page.evaluate(() => {
            // @ts-ignore
            if (!window.game || !window.game.actors) return [];
            // @ts-ignore
            return window.game.actors.contents
                // @ts-ignore
                .filter(a => a.isOwner)
                // @ts-ignore
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    img: a.img,
                    system: a.system // detailed data
                }));
        });
    }

    async updateActor(id: string, data: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async ({ id, data }) => {
            // @ts-ignore
            const actor = window.game.actors.get(id);
            if (!actor) return { error: 'Actor not found' };

            // Separate generic actor updates from embedded item updates (items.ID.field)
            const actorUpdates: any = {};
            // Group item updates by ID: { "ITEM_ID": { "system.lost": true } }
            const itemUpdatesMap: Record<string, any> = {};

            for (const key of Object.keys(data)) {
                if (key.startsWith('items.')) {
                    // key format: items.itemId.path.to.prop
                    const match = key.match(/^items\.([^\.]+)\.(.+)$/);
                    if (match) {
                        const itemId = match[1];
                        const propPath = match[2];
                        if (!itemUpdatesMap[itemId]) itemUpdatesMap[itemId] = { _id: itemId };
                        itemUpdatesMap[itemId][propPath] = data[key];
                    }
                } else {
                    actorUpdates[key] = data[key];
                }
            }

            // Perform Actor Update
            if (Object.keys(actorUpdates).length > 0) {
                await actor.update(actorUpdates);
            }

            // Perform Item Updates
            const itemUpdatesArray = Object.values(itemUpdatesMap);
            if (itemUpdatesArray.length > 0) {
                console.log('Antigravity Debug: Updating Embedded Items via item.update', itemUpdatesArray);

                for (const update of itemUpdatesArray) {
                    try {
                        const item = actor.items.get(update._id);
                        if (item) {
                            // Remove _id from update data as we are updating the item instance
                            const { _id, ...changes } = update;
                            await item.update(changes);
                            console.log(`Antigravity Debug: Updated item ${update._id}`, changes);
                        } else {
                            console.warn(`Antigravity Debug: Item ${update._id} not found on actor`);
                        }
                    } catch (e: any) {
                        console.error(`Antigravity Debug: Error updating item ${update._id}`, e);
                        // Don't fail the whole request, just log
                    }
                }
            }

            return { success: true };
        }, { id, data });
    }

    async getActor(id: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate((actorId) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return null;
            // @ts-ignore
            const items = actor.items.contents.map(i => ({
                id: i.id,
                name: i.name,
                type: i.type,
                img: i.img,
                system: i.system
            }));

            // @ts-ignore
            const effects = actor.effects.contents.map(e => ({
                id: e.id,
                label: e.label,
                icon: e.icon,
                disabled: e.disabled,
                duration: e.duration,
                changes: e.changes,
                description: e.description || e.flags?.core?.statusId // fallback
            }));

            return {
                id: actor.id,
                name: actor.name,
                type: actor.type,
                img: actor.img,
                system: actor.system,
                items: items,
                effects: effects,
                // @ts-ignore
                currentUser: window.game.user ? window.game.user.name : 'Unknown',
                // @ts-ignore
                systemConfig: window.game.shadowdark?.config || {},
                // @ts-ignore
                // We can't easily send all pack content, but maybe we can send a list of pack metadata if needed later?
                // For now, let's just rely on what we have.
            };
        }, id);
    }

    async sendMessage(content: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async (msg) => {
            // @ts-ignore
            if (!window.ChatMessage) return null;
            // @ts-ignore
            return await window.ChatMessage.create({
                // @ts-ignore
                user: window.game.user.id,
                content: msg,
                type: 1 // CONST.CHAT_MESSAGE_TYPES.OTHER (IC/OOC depends, generic is safer)
            });
        }, content);
    }

    async roll(formula: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        // Strip /r or /roll prefix (and optional whitespace)
        // Foundry's Roll class fails if it sees the command prefix
        const cleanFormula = formula.trim().replace(/^\/(r|roll)\s*/, '');

        // Execute a roll in Foundry
        return await this.page.evaluate(async (f) => {
            // @ts-ignore
            if (!window.Roll) return null;
            // @ts-ignore
            const r = new window.Roll(f);
            await r.evaluate();
            // @ts-ignore
            if (window.ChatMessage) {
                // @ts-ignore
                await window.ChatMessage.create({
                    // @ts-ignore
                    user: window.game.user.id,
                    content: `Rolling: ${f}`,
                    rolls: [r],
                    type: 5 // CONST.CHAT_MESSAGE_TYPES.ROLL
                });
            }
            return {
                total: r.total,
                result: r.result,
                formula: r._formula
            };
        }, cleanFormula);
    }

    async getCompendiumIndex(packName: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async (pName) => {
            // @ts-ignore
            const pack = window.game.packs.get(pName);
            if (!pack) return null;

            // @ts-ignore
            // Ensure index is loaded
            await pack.getIndex();

            // @ts-ignore
            return pack.index.map(i => ({
                id: i._id,
                name: i.name,
                uuid: `Compendium.${pName}.${i.type || 'Item'}.${i._id}` // Construct standardized UUID
            }));
        }, packName);
    }

    async getAllCompendiumIndices() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results = [];
            for (const p of packs) {
                // @ts-ignore
                await p.getIndex();
                results.push({
                    collection: p.collection,
                    title: p.title,
                    // @ts-ignore
                    index: p.index.map(i => ({
                        id: i._id,
                        name: i.name,
                        // Use p.documentName (e.g. "Item", "Actor") for standardized UUIDs
                        // Fallback to 'Item' if missing, though it shouldn't be.
                        uuid: `Compendium.${p.collection}.${p.documentName || 'Item'}.${i._id}`
                    }))
                });
            }
            return results;
        });
    }

    async getSystemData() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async () => {
            // @ts-ignore
            const packs = window.game.packs.contents;
            const results = {
                classes: [] as any[],
                ancestries: [] as any[],
                backgrounds: [] as any[],
                languages: [] as any[], // Add languages
                titles: {} // Cache titles by Class Name -> { level, name }[]
            };

            for (const pack of packs) {
                // @ts-ignore
                if (pack.documentName !== 'Item') continue;

                // @ts-ignore
                if (!pack.index.size) await pack.getIndex();
                // @ts-ignore
                const index = pack.index;

                // @ts-ignore
                // Index Classes (Deep fetch for languages)
                const classIndex = index.filter((i: any) => i.type === 'Class');
                for (const c of classIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(c._id);
                    if (doc) {
                        // @ts-ignore
                        results.classes.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${c._id}`,
                            languages: doc.system?.languages || []
                        });
                    }
                }

                // Index Ancestries (Deep fetch for languages if needed, though mostly Class matters for color)
                const ancestryIndex = index.filter((i: any) => i.type === 'Ancestry');
                // We might as well deep fetch these too for consistency
                for (const a of ancestryIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(a._id);
                    if (doc) {
                        results.ancestries.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${a._id}`,
                            languages: doc.system?.languages || []
                        });
                    }
                }

                // @ts-ignore
                results.backgrounds.push(...index.filter(i => i.type === 'Background').map(i => ({ name: i.name, uuid: `Compendium.${pack.collection}.Item.${i._id}` })));

                // Index Languages (Need descriptions, so might need deep fetch or just trust index? Index usually doesn't have desc. We probably need full docs for languages to get description)
                // Let's try to get them from index first, if desc is missing we might need to load them.
                // Shadowdark languages are usually simple.
                const langIndex = index.filter((i: any) => i.type === 'Language');
                // We'll fetch the docs for languages to get descriptions
                for (const l of langIndex) {
                    // @ts-ignore
                    const doc = await pack.getDocument(l._id);
                    if (doc) {
                        // @ts-ignore
                        results.languages.push({
                            name: doc.name,
                            uuid: `Compendium.${pack.collection}.Item.${l._id}`,
                            description: doc.system?.description?.value || doc.system?.desc || '',
                            rarity: doc.system?.rarity || 'common'
                        });
                    }
                }

                // Deep Fetch for Titles (only for Classes)
                for (const c of classIndex) {
                    // We need full document to get system.titles
                    // @ts-ignore
                    const doc = await pack.getDocument(c._id);
                    if (doc && doc.system?.titles) {
                        // @ts-ignore
                        results.titles[doc.name] = doc.system.titles;
                    }
                }
            }
            return results;
        });
    }

    async getChatLog(limit: number = 20) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate((limit) => {
            // @ts-ignore
            if (!window.game || !window.game.messages) return [];
            // @ts-ignore
            // Return last N messages
            // Return last N messages, sorted by timestamp
            // @ts-ignore
            const allMessages = [...window.game.messages.contents].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const messages = allMessages.slice(-limit);

            // @ts-ignore
            return messages.map(m => {
                // @ts-ignore
                const roll = m.rolls?.length ? m.rolls[0] : m.roll;
                if (m.isRoll || roll) {
                    console.log('Roll Debug:', {
                        id: m.id,
                        total: roll?.total,
                        formula: roll?._formula || roll?.formula,
                        keys: roll ? Object.keys(roll) : []
                    });
                }

                // @ts-ignore
                const total = roll?.total ?? roll?._total ?? roll?.result;

                return {
                    id: m.id,
                    // @ts-ignore
                    content: m.content || m.data?.content || '',
                    // @ts-ignore
                    flavor: m.flavor || m.data?.flavor || '',
                    // @ts-ignore
                    user: m.user?.name || 'Unknown',
                    // @ts-ignore
                    timestamp: m.timestamp || Date.now(),
                    // @ts-ignore
                    isRoll: (!!roll) || m.isRoll || (total !== undefined),
                    // @ts-ignore
                    rollTotal: total,
                    // @ts-ignore
                    rollFormula: roll?._formula || roll?.formula || '',
                    // @ts-ignore
                    isCritical: roll?.dice?.some((d: any) => d.results?.some((r: any) => r.critical)),
                    // @ts-ignore
                    isFumble: roll?.dice?.some((d: any) => d.results?.some((r: any) => r.fumble)),
                    // @ts-ignore
                    debug: roll ? { total: roll.total, _total: roll._total, result: roll.result, formula: roll.formula, class: roll.constructor?.name } : null
                };
            }).reverse();
        }, limit);
    }

    async waitForFunction(pageFunction: Function | string, arg?: any, options?: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');
        return await this.page.waitForFunction(pageFunction as any, arg, options);
    }

    async evaluate<T>(fn: (args: any) => T | Promise<T>, args?: any): Promise<T> {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');
        return await this.page.evaluate(fn, args);
    }

    async close() {
        await this.browser?.close();
        this.browser = null;
    }
}
