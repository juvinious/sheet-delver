import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import { FoundryConfig } from './types';
import { getAdapter } from '@/modules/core/registry';
import { ActorSheetData, SystemAdapter } from '@/modules/core/interfaces';

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

        // If it's a generic adapter handling an unknown system, we might want to inform it?
        // But the current GenericSystemAdapter hardcodes 'generic'. 
        // We can just trust the adapter.

        // Log what we found
        console.log(`Resolved adapter for '${systemId}': ${this.adapter.systemId}`);

        return this.adapter;
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

        // Capture console messages from the Foundry browser
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.toLowerCase().includes('antigravity debug') || text.includes('[FOUNDRY STATE DUMP]')) {
                console.log(`[FOUNDRY CONSOLE] ${text}`);
            }
        });

        console.log(`Navigating to ${this.config.url}...`);
        await this.page.goto(this.config.url, { waitUntil: 'networkidle' });
    }

    async getUsers() {
        if (!this.page) throw new Error('Not connected');

        // Instant check for state
        const state = await this.page.evaluate(() => {
            if (document.getElementById('board')) return 'loggedin';
            if (document.querySelector('select[name="userid"]')) return 'loginform';
            return 'unknown';
        });

        if (state !== 'loginform') return [];

        try {
            const options = await this.page.$$eval('select[name="userid"] option', (els) => {
                return els.map(el => ({
                    id: el.getAttribute('value'),
                    name: el.textContent || ''
                })).filter(u => u.id !== '');
            });
            return options;
        } catch (_e) {
            return [];
        }
    }

    async getUsersDetails() {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(() => {
            // @ts-ignore
            if (!window.game || !window.game.users) return [];

            // @ts-ignore
            return window.game.users.contents.map(u => ({
                id: u.id,
                name: u.name,
                isGM: u.isGM,
                active: u.active,
                color: u.color,
                characterName: u.character?.name || '', // Assigned actor name
                role: u.role // 0=None, 1=Player, 2=Trusted, 3=Assistant, 4=GM
            })).sort((a: any, b: any) => {
                // 1. "Gamemaster" always top (Case insensitive check)
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();

                if (aName === 'gamemaster') return -1;
                if (bName === 'gamemaster') return 1;

                // 2. GMs next
                if (a.isGM && !b.isGM) return -1;
                if (!a.isGM && b.isGM) return 1;

                // 3. Alphabetical
                return a.name.localeCompare(b.name);
            });
        });
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
                return new Promise((_, _reject) => { /* infinite wait */ });
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
                const isSetupTitle = document.title.includes('Foundry Virtual Tabletop');
                const isSetupElement = !!document.getElementById('setup');
                const isSetupUrl = window.location.href.includes('/setup');
                const isAuthUrl = window.location.href.includes('/auth');

                // Fallback attempt: Check for common setup page elements if #setup is missing
                const hasSetupLogo = !!document.querySelector('#logo'); // Often present on setup
                const hasWorldList = !!document.querySelector('#worlds-list'); // Found on setup/world picker

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




    async createActor(data: any) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        return await this.page.evaluate(async (actorData) => {
            // @ts-ignore
            if (!window.Actor) return { error: 'Actor class not found' };
            try {
                // @ts-ignore
                const actor = await window.Actor.create(actorData);

                // Post-Creation Linking (Critical for Shadowdark Level 1)
                // We need to link 'class', 'ancestry', 'background' to the actual embedded Item IDs
                // instead of the Compendium UUIDs provided in actorData.
                if (actor.system) {
                    const updates: any = {};

                    // Helper to link fields
                    const linkField = (field: string) => {
                        // Check if the original data had a UUID for this field
                        // @ts-ignore
                        const sourceUuid = actorData.system?.[field];
                        if (sourceUuid && typeof sourceUuid === 'string') {
                            // Find the embedded item with this Source ID
                            const item = actor.items.find((i: any) =>
                                i.flags?.core?.sourceId === sourceUuid ||
                                i.name === sourceUuid // Fallback if name matches UUID? Unlikely, but maybe name match if sourceId missing
                            );
                            if (item) {
                                updates[`system.${field}`] = item.id;
                            }
                        }
                    };

                    linkField('class');
                    linkField('ancestry');
                    linkField('background');
                    linkField('patron');

                    // Force persist simple fields in the update as well, to prevent system reset/hooks from clearing them logic
                    // @ts-ignore
                    if (actorData.system?.alignment) updates['system.alignment'] = actorData.system.alignment;
                    // @ts-ignore
                    if (actorData.system?.deity) updates['system.deity'] = actorData.system.deity;

                    // Re-apply HP if provided, as Class update might reset it
                    // @ts-ignore
                    if (actorData.system?.attributes?.hp) {
                        // Flatten keys to ensure both value and max are applied and not lost in merge
                        const hp = actorData.system.attributes.hp;
                        // @ts-ignore
                        if (hp.value !== undefined) updates['system.attributes.hp.value'] = hp.value;
                        // @ts-ignore
                        if (hp.max !== undefined) updates['system.attributes.hp.max'] = hp.max;
                    }

                    if (Object.keys(updates).length > 0) {
                        await actor.update(updates);
                    }
                }

                return { success: true, id: actor.id, name: actor.name };
            } catch (e: any) {
                return { error: e.message };
            }
        }, data);
    }

    async getActor(id: string, forceSystemId?: string) {
        if (!this.page || this.page.isClosed()) throw new Error('Not connected');

        let adapter: SystemAdapter;
        if (forceSystemId) {
            adapter = getAdapter(forceSystemId) || getAdapter('generic')!;
        } else {
            adapter = await this.resolveAdapter();
        }

        return await adapter.getActor(this, id);
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
        // [FORCE REBUILD] - Ensuring dumpPrefix is gone
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
        const adapter = await this.resolveAdapter();
        return await adapter.getSystemData(this);
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
                if (!m) return null;
                // DEBUG: Log raw message structure
                // console.log('ANTIGRAVITY DEBUG [Raw Message]', JSON.stringify(m, null, 2));
                // @ts-ignore
                const roll = m.rolls?.length ? m.rolls[0] : m.roll;

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
            }).filter(m => m !== null).reverse();
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
