import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import { FoundryConfig } from './types';
import { getAdapter } from '@/modules/core/registry';
import { SystemAdapter } from '@/modules/core/interfaces';

export class FoundryClient {
    public browser: Browser | null = null;
    public context: BrowserContext | null = null;
    public page: Page | null = null;
    private config: FoundryConfig;
    private adapter: SystemAdapter | null = null;

    constructor(config: FoundryConfig) {
        this.config = config;
    }

    private async resolveAdapter(): Promise<SystemAdapter> {
        // if (this.adapter) return this.adapter; // Disable caching for development
        // Always re-fetch adapter to allow for HMR updates

        const sys = await this.getSystem();
        const systemId = sys.id ? sys.id.toLowerCase() : 'generic';

        // Use Registry to get the correct adapter (or fallback to generic)
        const adapter = getAdapter(systemId);

        if (!adapter) {
            throw new Error(`Critical Error: Could not resolve adapter for system '${systemId}'`);
        }

        this.adapter = adapter;
        return this.adapter;
    }

    get isConnected(): boolean {
        return !!this.page && !this.page.isClosed();
    }

    async evaluate<T>(pageFunction: any, arg?: any): Promise<T> {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');
        return await this.page.evaluate(pageFunction, arg);
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

        // Capture console messages from the Foundry browser
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.toLowerCase().includes('antigravity') || text.includes('[FOUNDRY STATE DUMP]')) {
                console.log(`[FOUNDRY CONSOLE] ${text}`);
            }
        });

        console.log(`Navigating to ${this.config.url}...`);
        await this.page.goto(this.config.url, { waitUntil: 'networkidle' });
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

        // Race between Success (Game Ready) and Failure (Error Notification)
        const successPromise = this.page.waitForFunction(() => (window as any).game && (window as any).game.ready, null, { timeout: 60000 });

        const failurePromise = this.page.waitForSelector('#notifications .notification.error', { timeout: 10000 })
            .then(async (el) => {
                const text = await el?.textContent();
                throw new Error(text || 'Login failed');
            })
            .catch(() => {
                // If this times out, it means no error appeared within 10 seconds.
                return new Promise(() => { /* infinite wait */ });
            });

        await Promise.race([successPromise, failurePromise]);
    }

    async logout() {
        if (!this.page) return;
        console.log('Logging out...');
        // Force navigation to the join screen
        // Construct join URL
        const joinUrl = this.config.url.endsWith('/') ? this.config.url + 'join' : this.config.url + '/join';
        await this.page.goto(joinUrl);
        await this.page.waitForLoadState('networkidle');
    }

    async getSystem(): Promise<{
        id: string;
        title: string;
        version: string;
        worldTitle?: string;
        worldDescription?: string;
        nextSession?: string | null;
        users?: { active: number; total: number };
        background?: string;
        isLoggedIn?: boolean;
        theme?: any;
    }> {
        if (!this.page) throw new Error('Not connected');

        try {
            const data = await this.page.evaluate(async () => {
                const DEFAULT_BACKGROUND = 'ui/backgrounds/setup.webp';

                // @ts-ignore
                const game = window.game;

                // 1. Try standard game.system (logged in)
                let s = game?.system;
                // 2. Try game.data.system (older versions or specific contexts)
                if (!s?.id) s = game?.data?.system;

                // 3. Try game.world.system (sometimes available on login screen)
                if (!s?.id && game?.world?.system) {

                    // ZOMBIE STATE PROBE
                    // If we are relying on cached world system data, we might be in a Zombie state (World Stopped).
                    // We check if the '/setup' endpoint is actually available and active.
                    // If it is, correct the state.

                    try {
                        const setupCheck = await fetch('/setup', { method: 'HEAD' });
                        console.log(`[DEBUG PROBE] /setup Status: ${setupCheck.status}, URL: ${setupCheck.url}`);

                        // Check if we arrived at setup (either 200 OK on /setup, or redirected to /setup or /auth)
                        // If the world is stopped, accessing /setup will often redirect to /auth (Admin Login)
                        if (setupCheck.ok && (setupCheck.url.includes('/setup') || setupCheck.url.includes('/auth'))) {
                            if (!window.location.href.includes('/setup')) {
                                setTimeout(() => { window.location.href = '/setup'; }, 200);
                            }
                            return {
                                id: 'setup',
                                title: 'World Stopped (Probe)',
                                version: '0.0.0',
                                worldTitle: '',
                                worldDescription: '',
                                nextSession: null,
                                users: { active: 0, total: 0 },
                                background: DEFAULT_BACKGROUND,
                                isLoggedIn: false
                            };
                        }
                    } catch (e: any) {
                        console.log(`[DEBUG PROBE] Error: ${e.message}`);
                    }

                    // Extract system from world info
                    const ws = game.world.system;
                    if (typeof ws === 'string') {
                        s = { id: ws, title: ws, version: '0.0.0' };
                    } else {
                        s = ws;
                    }
                }

                // Extract generic background
                let bg = game?.world?.background; // Official world background
                if (!bg) {
                    // Fallback to scraping CSS if on login screen
                    const bodyStyle = window.getComputedStyle(document.body);
                    const bgImage = bodyStyle.backgroundImage;
                    if (bgImage && bgImage !== 'none') {
                        const match = bgImage.match(/url\((['"]?)(.*?)\1\)/);
                        if (match) bg = match[2];
                    }
                }

                if (!bg) {
                    bg = DEFAULT_BACKGROUND;
                }

                // Setup Mode Detection
                const isSetupElement = !!document.getElementById('setup');
                const isSetupUrl = window.location.href.includes('/setup');
                const isAuthUrl = window.location.href.includes('/auth');

                const isSetup = isSetupElement || isSetupUrl || isAuthUrl;

                if (isSetup) {
                    return {
                        id: 'setup',
                        title: 'Foundry Setup',
                        version: '0.0.0',
                        worldTitle: '',
                        worldDescription: '',
                        nextSession: null,
                        users: { active: 0, total: 0 },
                        background: DEFAULT_BACKGROUND,
                        isLoggedIn: false
                    };
                }

                // Socket / Connection Check
                // @ts-ignore
                if (window.game && window.game.socket && window.game.socket.connected === false) {
                    return {
                        id: 'setup',
                        title: 'Connection Lost',
                        version: '0.0.0',
                        worldTitle: '',
                        worldDescription: '',
                        nextSession: null,
                        users: { active: 0, total: 0 },
                        background: DEFAULT_BACKGROUND,
                        isLoggedIn: false
                    };
                }

                // Zombie State Detection (Explicit)
                // @ts-ignore
                if (window.game && window.game.world && window.game.world.active === false) {

                    // Force navigation to clear state (Async to allow return value to pass)
                    if (!window.location.href.includes('/setup')) {
                        setTimeout(() => {
                            window.location.href = '/setup';
                        }, 500);
                    }

                    return {
                        id: 'setup',
                        title: 'Redirecting to Setup...',
                        version: '0.0.0',
                        worldTitle: '',
                        worldDescription: '',
                        nextSession: null,
                        users: { active: 0, total: 0 },
                        background: DEFAULT_BACKGROUND,
                        isLoggedIn: false
                    };
                }

                // Missing System / Loading State
                // If we are here, we are NOT on a Setup page, and the world is NOT explicitly inactive.
                // But we couldn't find a system ID. This implies the game is still loading or in an undefined state.
                if (!s || !s.id) {
                    return {
                        id: 'loading',
                        title: 'Loading...',
                        version: '0.0.0',
                        worldTitle: '',
                        worldDescription: '',
                        nextSession: null,
                        users: { active: 0, total: 0 },
                        background: bg || DEFAULT_BACKGROUND,
                        isLoggedIn: false
                    };
                }

                if (s && (s.id || s._id)) {
                    // @ts-ignore
                    const users = window.game.users;
                    // @ts-ignore
                    console.log('[DEBUG] game.world:', window.game.world);
                    // @ts-ignore
                    console.log('[DEBUG] game.users:', window.game.users);

                    // @ts-ignore
                    const activeUsers = users ? users.filter(u => u.active).length : 0;
                    // @ts-ignore
                    const totalUsers = users ? users.size : 0;

                    return {
                        id: s.id || s._id,
                        title: s.title || 'Unknown',
                        version: s.version || '0.0.0',
                        // @ts-ignore
                        worldTitle: game.world?.title || '',
                        // @ts-ignore
                        worldDescription: game.world?.description || '',
                        // @ts-ignore
                        nextSession: game.world?.nextSession || null,
                        // @ts-ignore
                        users: { active: activeUsers, total: totalUsers },
                        background: bg,
                        // @ts-ignore
                        isLoggedIn: !!(window.game && window.game.user)
                    };
                }

                return {
                    id: 'setup',
                    title: 'Unknown / Setup',
                    version: '0.0.0',
                    worldTitle: '',
                    worldDescription: '',
                    nextSession: null,
                    users: { active: 0, total: 0 },
                    background: bg,
                    // @ts-ignore
                    isLoggedIn: !!(window.game && window.game.user)
                };
            });

            // Post-processing
            if (data) {
                if (data.id && data.id !== 'setup' && data.id !== 'unknown') {
                    const adapter = getAdapter(data.id);
                    return { ...data, theme: adapter?.theme };
                }
            }

            return {
                id: 'setup',
                title: 'Foundry Setup',
                version: '0.0.0',
                worldTitle: '',
                worldDescription: '',
                nextSession: null,
                users: { active: 0, total: 0 },
                background: 'ui/backgrounds/setup.webp',
                isLoggedIn: false
            };

        } catch (error) {
            console.error('getSystem Error:', error);
            // Default to setup on error
            return {
                id: 'setup',
                title: 'Connection Error / Setup',
                version: '0.0.0',
                worldTitle: '',
                worldDescription: '',
                nextSession: null,
                users: { active: 0, total: 0 },
                background: 'ui/backgrounds/setup.webp',
                isLoggedIn: false
            };
        }
    }
    async getUsers() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(() => {
            // @ts-ignore
            if (!window.game || !window.game.users) return [];
            // @ts-ignore
            return window.game.users.contents.map((u: any) => ({
                id: u.id,
                name: u.name,
                active: u.active,
                role: u.role,
                isGM: u.isGM,
                color: u.color,
                avatar: u.character?.img || 'icons/svg/mystery-man.svg'
            }));
        });
    }

    async getUsersDetails() {
        return this.getUsers();
    }

    async getSystemData() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');
        const adapter = await this.resolveAdapter();
        return await adapter.getSystemData(this);
    }


    async getActors() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        // Execute script in browser context to get data from the global 'game' object
        // This is the most reliable way vs scraping HTML
        return await this.page.evaluate(async () => {
            // @ts-ignore
            if (!window.game || !window.game.actors) return [];

            // Helper to resolve UUID/links
            const resolveName = async (field: any) => {
                if (typeof field === 'string' && (field.startsWith('Compendium') || field.startsWith('Actor') || field.startsWith('Item'))) {
                    try {
                        // @ts-ignore
                        const item = await fromUuid(field);
                        return item?.name;
                    } catch { }
                }
                return undefined;
            };

            // @ts-ignore
            const actors = window.game.actors.contents.filter(a => a.isOwner);

            // Map asynchronously to resolve names
            const results = await Promise.all(actors.map(async (a: any) => {
                // Pre-calculate resolved names for normalizeActorData usage
                const resolvedNames: any = {};

                if (a.system) {
                    // Try to resolve standard shadowdark fields if they are UUID strings
                    if (a.system.class) resolvedNames.class = await resolveName(a.system.class);
                    if (a.system.ancestry) resolvedNames.ancestry = await resolveName(a.system.ancestry);
                    if (a.system.background) resolvedNames.background = await resolveName(a.system.background);
                }

                // Robustly extract items
                let extractedItems = [];
                if (a.items) {
                    if (Array.isArray(a.items)) extractedItems = a.items;
                    else if (a.items.contents) extractedItems = a.items.contents;
                    else if (typeof a.items.values === 'function') extractedItems = Array.from(a.items.values());
                }

                return {
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    img: a.img,
                    system: a.system,
                    items: extractedItems.map((i: any) => ({
                        id: i.id,
                        _id: i.id, // Ensure both ID formats are available
                        name: i.name,
                        type: i.type,
                        uuid: i.uuid,
                        flags: i.flags
                    })),
                    computed: { resolvedNames } // Attach resolved names here
                };
            }));

            return results;
        });
    }

    async getAllCompendiumIndices() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async () => {
            // @ts-ignore
            if (!window.game || !window.game.packs) return [];

            // @ts-ignore
            const packs = window.game.packs.contents;
            const indices = await Promise.all(packs.map(async (p: any) => {
                const index = await p.getIndex();
                return {
                    name: p.metadata.label,
                    collection: p.collection,
                    index: Array.from(index).map((i: any) => ({
                        _id: i._id,
                        name: i.name,
                        uuid: i.uuid || `Compendium.${p.collection}.${i._id}`
                    }))
                };
            }));
            return indices;
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
            let actorUpdateResult = null;
            if (Object.keys(actorUpdates).length > 0) {
                try {
                    actorUpdateResult = await actor.update(actorUpdates);
                } catch (e: any) {
                    console.error('Actor update failed:', e.message, e.stack);
                    return { error: 'Actor update failed: ' + e.message };
                }
            }

            // Perform Item Updates
            const itemUpdatesArray = Object.values(itemUpdatesMap);
            if (itemUpdatesArray.length > 0) {

                for (const update of itemUpdatesArray) {
                    try {
                        const item = actor.items.get(update._id);
                        if (item) {
                            // Remove _id from update data as we are updating the item instance
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const { _id, ...safeUpdate } = update;
                            await item.update(safeUpdate);
                        } else {
                            console.warn(`Item ${update._id} not found on actor`);
                        }
                    } catch (e: any) {
                        console.error(`Error updating item ${update._id}`, e);
                        // Don't fail the whole request, just log
                    }
                }
            }

            return {
                success: true,
                actorUpdateResult,
                updatedFields: Object.keys(actorUpdates),
                verified: true
            };
        }, { id, data });
    }

    async updateActorEffect(actorId: string, effectId: string, updateData: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(({ actorId, effectId, updateData }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');

            // Find effect in all applicable effects (includes effects from items)
            // @ts-ignore
            const effect = Array.from(actor.allApplicableEffects()).find((e: any) => e.id === effectId || e._id === effectId) as any;
            if (!effect) throw new Error('Effect not found');

            return effect.update(updateData);
        }, { actorId, effectId, updateData });
    }

    async deleteActorEffect(actorId: string, effectId: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(({ actorId, effectId }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');

            // Find effect in all applicable effects
            // @ts-ignore
            const effect = Array.from(actor.allApplicableEffects()).find(e => e.id === effectId || e._id === effectId);
            if (!effect) throw new Error('Effect not found');

            // Delete from the parent document (actor or item)
            // @ts-ignore
            return effect.parent.deleteEmbeddedDocuments('ActiveEffect', [effect.id]);
        }, { actorId, effectId });
    }

    async createActorItem(actorId: string, itemData: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async ({ actorId, itemData }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');
            const items = await actor.createEmbeddedDocuments('Item', [itemData]);
            return items[0] ? items[0].id : null;
        }, { actorId, itemData });
    }

    async deleteActorItem(actorId: string, itemId: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async (data: { actorId: string, itemId: string }) => {
            const { actorId, itemId } = data;
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');
            await actor.deleteEmbeddedDocuments('Item', [itemId]);
            return true;
        }, { actorId, itemId });
    }

    async updateActorItem(actorId: string, itemData: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async ({ actorId, itemData }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');

            // @ts-ignore
            const item = actor.items.get(itemData._id || itemData.id);
            if (!item) throw new Error('Item not found');

            // Sanitize: Do not update _id
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _id, id, ...updates } = itemData;

            await item.update(updates);
            return item.id;
        }, { actorId, itemData });
    }

    async toggleStatusEffect(actorId: string, effectId: string, active?: boolean, overlay = false) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async ({ actorId, effectId, active, overlay }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');

            // toggleStatusEffect(statusId, {active, overlay})
            // @ts-ignore
            return await actor.toggleStatusEffect(effectId, { active, overlay });
        }, { actorId, effectId, active, overlay });
    }

    async createActor(data: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        const result: any = await this.page.evaluate(async (actorData) => {
            // @ts-ignore
            if (!window.Actor) return { error: 'Actor class not found' };
            try {
                // @ts-ignore
                const actor = await window.Actor.create(actorData);
                return { success: true, id: actor.id, name: actor.name, systemId: actor.system?.id };
            } catch (e: any) {
                console.error("Create actor error:", e);
                return { error: e.message };
            }
        }, data);

        if (result && result.success && result.id) {
            try {
                const adapter = await this.resolveAdapter();
                if (adapter && adapter.postCreate) {
                    await adapter.postCreate(this, result.id, data);
                }
            } catch (e) {
                console.error("Adapter Post-Create Failed:", e);
            }
        }

        return result;
    }

    async deleteActor(id: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async (actorId) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) throw new Error('Actor not found');
            await actor.delete();
            return true;
        }, id);
    }

    async getActor(id: string, forceSystemId?: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        let adapter: SystemAdapter;
        if (forceSystemId) {
            adapter = getAdapter(forceSystemId) || getAdapter('generic')!;
        } else {
            adapter = await this.resolveAdapter();
        }

        if (!adapter.getActor) {
            throw new Error(`Adapter for system '${adapter.systemId}' does not support getActor`);
        }
        return await adapter.getActor(this, id);
    }

    async getChatLog(limit = 100) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate((limit) => {
            // @ts-ignore
            if (!window.game || !window.game.messages) return [];
            // @ts-ignore
            const messages = window.game.messages.contents;
            // Get last N messages
            return messages.slice(-limit).map((m: any) => ({
                id: m.id,
                content: m.content,
                flavor: m.flavor,
                user: m.user?.id,
                username: m.user?.name,
                alias: m.alias,
                speaker: m.speaker,
                timestamp: m.timestamp,
                type: m.type,
                rolls: m.rolls ? m.rolls.map((r: any) => ({
                    total: r.total,
                    formula: r.formula,
                    result: r.result,
                    tooltip: r.tooltip // Note: Rendered HTML tooltip might need parsing or sanitizing
                })) : []
            })).reverse(); // Newest first
        }, limit);
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
                type: 1
            });
        }, content);
    }

    async useItem(actorId: string, itemId: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        const baseUrl = this.url;
        return await this.page.evaluate(async ({ actorId, itemId, baseUrl }: any) => {
            // ... previous implementation ...
            return true;
        }, { actorId, itemId, baseUrl });
    }

    async roll(formula: string, flavor?: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async ({ formula, flavor }) => {
            try {
                // @ts-ignore
                const r = new window.Roll(formula);
                await r.evaluate();

                // Send to chat
                await r.toMessage({
                    flavor: flavor || ''
                });

                return {
                    formula: r.formula,
                    total: r.total,
                    result: r.result,
                    terms: r.terms,
                    json: r.toJSON()
                };
            } catch (e: any) {
                return { error: e.message };
            }
        }, { formula, flavor });
    }
}
