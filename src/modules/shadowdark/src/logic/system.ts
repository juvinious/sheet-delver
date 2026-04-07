import { SystemAdapter, ActorSheetData } from '@modules/registry';
import { normalizeItemData } from './rules';
import { logger } from '@shared/utils/logger';
import { isClassSpellcaster } from './rules';
import { shadowdarkTheme } from '../ui/themes/shadowdark';

// Internal module references (populated via initialize)
let _ShadowdarkCache: any = null;
let _ShadowdarkNormalizer: any = null;
let _ShadowdarkDiscovery: any = null;
let _dataManager: any = null;
let _resolveDocumentName: any = null;

/**
 * ShadowdarkAdapter is the primary entry point for the Shadowdark module.
 * It follows a facade pattern, delegating specialized logic to sub-services.
 * 
 * NOTE: We avoid static imports of ShadowdarkDiscovery, ShadowdarkNormalizer,
 * DataManager, and CompendiumCache here to prevent build-time Node.js module
 * leaks (like 'fs') into the client-side bundle.
 */
export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';
    private static instance: ShadowdarkAdapter;

    theme = {
        bg: 'bg-neutral-900',
        panelBg: 'bg-neutral-800',
        text: 'text-neutral-200',
        accent: 'text-amber-500',
        button: 'bg-amber-700 hover:bg-amber-600',
        headerFont: 'font-serif tracking-widest',
        success: 'bg-green-800 hover:bg-green-700'
    };

    componentStyles = shadowdarkTheme;

    constructor() {
        if (!ShadowdarkAdapter.instance) {
            ShadowdarkAdapter.instance = this;
        }
        return ShadowdarkAdapter.instance;
    }

    public static getInstance(): ShadowdarkAdapter {
        if (!ShadowdarkAdapter.instance) {
            ShadowdarkAdapter.instance = new ShadowdarkAdapter();
        }
        return ShadowdarkAdapter.instance;
    }

    /**
     * Required by SystemAdapter interface.
     */
    getInitiativeFormula(actor: any): string {
        let dexMod = 0;
        const s = actor?.system || {};
        const c = actor?.computed || {};

        if (s.abilities?.dex?.mod !== undefined) dexMod = Number(s.abilities.dex.mod);
        else if (c.abilities?.dex?.mod !== undefined) dexMod = Number(c.abilities.dex.mod);
        else if (s.abilities?.dex?.value !== undefined) dexMod = Math.floor((Number(s.abilities.dex.value) - 10) / 2);

        if (isNaN(dexMod)) dexMod = 0;
        const hasAdvantage = Array.isArray(s.bonuses?.advantage) && s.bonuses.advantage.includes('initiative');
        const baseDie = hasAdvantage ? '2d20kh1' : '1d20';
        const sign = dexMod >= 0 ? '+' : '';

        return dexMod !== 0 ? `${baseDie}${sign}${dexMod}` : baseDie;
    }

    /**
     * Resolves high-level card data for world-level actor previews (Dashboard).
     * 
     * NOTE: This method must remain synchronous to avoid flickering and lifecycle 
     * issues during React rendering. It utilizes the "logic firewall" pattern,
     * accessing pre-loaded local references to avoid top-level static imports.
     *
     * Priority for name resolution:
     *   1. actor.computed.resolvedNames — already populated by the normalization pipeline.
     *   2. dataManager.index — the always-available in-memory UUID registry (initialized at boot).
     *   3. Humanized last segment of the UUID string as a last resort.
     *
     * Note: ShadowdarkCache.systemData scan was removed — it duplicated DataManager and was only
     * populated after a full discovery run, making it unreliable for dashboard cards.
     */
    getActorCardData(actor: any): any {
        if (!_ShadowdarkCache || !_resolveDocumentName) return { subtext: 'Loading...' };

        const s = actor.system || {};
        const names = actor.computed?.resolvedNames || {};
        const cache = _ShadowdarkCache.getInstance();

        const resolve = (val: any) => {
            return _resolveDocumentName(val, cache.systemData);
        };

        const ancestry = names.ancestry || resolve(s.ancestry);
        const className = names.class || resolve(s.class);
        const level = s.level?.value || 0;

        return {
            subtext: `${ancestry} • ${className === 'Level 0' ? 'Adventurer' : className} • Level ${level}`.trim(),
            ancestry,
            class: className,
            level
        };
    }

    match(actor: any): boolean {
        const hasShadowdarkType = ['player', 'character', 'npc'].includes(actor.type?.toLowerCase());
        const hasShadowdarkSystem = actor.system?.attributes?.hp !== undefined ||
            actor.system?.abilities?.str !== undefined;

        return actor.systemId === 'shadowdark' || (hasShadowdarkType && hasShadowdarkSystem);
    }

    /**
     * Primary entry point for fetching and normalizing an actor from the Foundry server.
     */
    async getActor(client: any, actorId: string): Promise<any> {
        const cache = _ShadowdarkCache.getInstance();
        const cached = cache.getActor(actorId);
        if (cached) return cached;

        const systemData = await this.getSystemData(client);
        let actorData = null;

        try {
            actorData = await (client.getActorRaw ? client.getActorRaw(actorId) : client.getActor(actorId));
        } catch (e: any) {
            logger.error(`[ShadowdarkAdapter] Failed to fetch actor ${actorId}: ${e.message}`);
            return { error: e.message };
        }

        if (!actorData) return null;

        const actor = {
            ...actorData,
            items: (actorData.items || []).map((item: any) => normalizeItemData(item))
        };

        await _ShadowdarkNormalizer.resolveActorNames(actor, systemData);
        const normalized = _ShadowdarkNormalizer.normalizeActorData(actor, systemData);

        cache.setActor(actorId, normalized);
        return normalized;
    }

    /**
     * Fetches and caches system-wide data (Classes, Spells, etc.)
     */
    async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        return _ShadowdarkDiscovery.getSystemData(client, options);
    }

    /**
     * Delegated normalization logic.
     * 
     * NOTE: Synchronous pattern matching the SystemAdapter interface. 
     * Returns minimal data if logic modules are not yet initialized to 
     * prevent runtime crashes during early-load rendering cycles.
     */
    normalizeActorData(actor: any, _client?: any): ActorSheetData {
        if (!_ShadowdarkCache || !_ShadowdarkNormalizer) {
            return { id: actor.id || actor._id, name: actor.name, type: actor.type, img: actor.img, system: actor.system } as any;
        }
        const cache = _ShadowdarkCache.getInstance();
        return _ShadowdarkNormalizer.normalizeActorData(actor, cache.systemData);
    }

    /**
     * Delegated name resolution logic.
     */
    async resolveActorNames(actor: any, clientOrCache: any): Promise<void> {
        const cache = _ShadowdarkCache.getInstance();
        let systemData = cache.systemData;

        if (!systemData && clientOrCache && typeof clientOrCache.getSystem === 'function') {
            systemData = await this.getSystemData(clientOrCache);
        }

        return _ShadowdarkNormalizer.resolveActorNames(actor, systemData);
    }

    /**
     * Unified document resolver.
     */
    async resolveDocument(client: any, uuid: string): Promise<any> {
        return this.getCompendiumItem(client, uuid);
    }

    async getLevelUpData(client: any, actor: any, classUuidOverride?: string, patronUuidOverride?: string) {
        const currentLevel = actor?.system?.level?.value || 0;
        const targetLevel = currentLevel + 1;
        const currentXP = actor?.system?.level?.xp || 0;
        const classUuid = classUuidOverride || actor?.system?.class;
        const patronUuid = patronUuidOverride || actor?.system?.patron;
        const conMod = actor?.system?.abilities?.con?.mod || 0;

        let classDoc = null;
        let patronDoc = null;

        if (classUuid) classDoc = await this.resolveDocument(client, classUuid);
        if (patronUuid) patronDoc = await this.resolveDocument(client, patronUuid);

        if (!classDoc && classUuid) {
            try {
                classDoc = await client.fetchByUuid(classUuid);
            } catch (e) { logger.error(`[ShadowdarkAdapter] Failed to fetch class ${classUuid}:`, e); }
        }

        if (!patronDoc && patronUuid) {
            try {
                patronDoc = await client.fetchByUuid(patronUuid);
            } catch (e) { logger.error(`[ShadowdarkAdapter] Failed to fetch patron ${patronUuid}:`, e); }
        }

        const talentGained = targetLevel % 2 !== 0;
        const isSpellcasterChar = classDoc ? isClassSpellcaster(classDoc) : false;
        const spellsToChoose: Record<number, number> = {};
        let availableSpells: any[] = [];

        if (isSpellcasterChar && classDoc) {
            if (classDoc.system?.spellcasting?.spellsknown) {
                const skTable = classDoc.system.spellcasting.spellsknown;
                const currentSpells = skTable[String(currentLevel)] || skTable[currentLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                const targetSpells = skTable[String(targetLevel)] || skTable[targetLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                for (let tier = 1; tier <= 5; tier++) {
                    const targetVal = targetSpells[String(tier)] ?? targetSpells[tier] ?? 0;
                    const currentVal = currentSpells[String(tier)] ?? currentSpells[tier] ?? 0;
                    const diff = targetVal - currentVal;
                    if (diff > 0) spellsToChoose[tier] = diff;
                }
            }

            if (classDoc.name) {
                availableSpells = await _dataManager.getSpellsBySource(classDoc.name);
            }
        }

        return {
            success: true,
            actorId: actor?.id || actor?._id || 'new',
            currentLevel,
            targetLevel,
            currentXP,
            talentGained,
            classHitDie: classDoc?.system?.hitPoints || '1d4',
            classTalentTable: classDoc?.system?.classTalentTable,
            patronBoonTable: patronDoc?.system?.boonTable,
            canRollBoons: classDoc?.system?.patron?.required || false,
            startingBoons: (targetLevel === 1 && classDoc?.system?.patron?.startingBoons) || 0,
            isSpellcaster: isSpellcasterChar,
            spellsToChoose,
            availableSpells,
            conMod,
            classUuid: classDoc?.uuid || classUuid || null
        };
    }

    getRollData(actor: any, type: string, key: string, options: any = {}): { formula: string; type: string; label: string; flags?: any } | null {
        if (options.manualValue !== undefined && options.manualValue !== null) {
            let label = 'Manual Roll';
            if (type === 'ability') label = `${key.toUpperCase().replace('ABILITY', '')} (Manual)`;
            if (type === 'item') {
                const item = (actor.items || []).find((i: any) => i._id === key || i.id === key);
                label = item ? `${item.name} (Manual)` : 'Item (Manual)';
            }

            const total = Number(options.manualValue);
            const bonuses = [];
            if (options.abilityBonus !== undefined) bonuses.push(Number(options.abilityBonus));
            if (options.itemBonus !== undefined) bonuses.push(Number(options.itemBonus));
            if (options.talentBonus !== undefined) bonuses.push(Number(options.talentBonus));

            const totalBonus = bonuses.reduce((acc, b) => acc + b, 0);
            const formula = totalBonus !== 0 ? `${total} + ${totalBonus}` : String(total);

            return { formula, type: 'manual', label, flags: { shadowdark: { isManual: true } } };
        }

        const advMode = options.advantageMode || 'normal';
        let dice = '1d20';
        if (advMode === 'advantage') dice = '2d20kh';
        if (advMode === 'disadvantage') dice = '2d20kl';

        if (type === 'ability') {
            let mod = 0;
            if (options.abilityBonus !== undefined) {
                mod = Number(options.abilityBonus);
            } else {
                const abilities = actor.system.abilities || {};
                if (abilities[key]) mod = abilities[key].mod;
            }
            if (options.talentBonus) mod += Number(options.talentBonus);

            const sign = mod >= 0 ? '+' : '';
            return {
                formula: `${dice}${sign}${mod}`,
                type: 'ability',
                label: `${key.toUpperCase().replace('ABILITY', '')} Check`
            };
        }

        if (type === 'item') {
            let item = (actor.items || []).find((i: any) => i._id === key || i.id === key);
            if (!item && options.itemData) item = options.itemData;

            if (item) {
                let totalBonus = 0;
                let label = '';

                if (item.type === 'Spell') {
                    label = `Cast ${item.name}`;
                    if (options.abilityBonus !== undefined) {
                        totalBonus += Number(options.abilityBonus);
                    } else {
                        const statKey = item.system?.ability || actor.computed?.spellcastingAbility?.toLowerCase() || 'int';
                        totalBonus += actor.system.abilities?.[statKey]?.mod || 0;
                    }
                } else if (item.type === 'Weapon') {
                    label = `${item.name} Attack`;
                    if (options.abilityBonus !== undefined && options.itemBonus !== undefined) {
                        totalBonus = Number(options.abilityBonus) + Number(options.itemBonus);
                    } else {
                        const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                        const isRanged = item.system?.type === 'ranged' || item.system?.range === 'near' || item.system?.range === 'far';

                        const str = actor.system.abilities?.str?.mod || 0;
                        const dex = actor.system.abilities?.dex?.mod || 0;
                        const itemAtkBonus = Number(item.system?.bonuses?.attackBonus || 0);

                        const globalAttackBonus = Number(actor.system?.bonuses?.attackBonus || 0);
                        const meleeAttackBonus = Number(actor.system?.bonuses?.meleeAttackBonus || 0);
                        const rangedAttackBonus = Number(actor.system?.bonuses?.rangedAttackBonus || 0);

                        let mod = 0;
                        if (isRanged) mod = dex + globalAttackBonus + rangedAttackBonus;
                        else if (isFinesse) mod = Math.max(str, dex) + globalAttackBonus + meleeAttackBonus;
                        else mod = str + globalAttackBonus + meleeAttackBonus;

                        totalBonus = mod + itemAtkBonus;
                    }
                }

                if (options.talentBonus) totalBonus += Number(options.talentBonus);

                const sign = totalBonus >= 0 ? '+' : '';
                return {
                    formula: `${dice}${sign}${totalBonus}`,
                    type: item.type === 'Spell' ? 'spell' : 'attack',
                    label: label
                };
            }
        }
        return null;
    }

    /**
     * Resolves a compendium item by its UUID, prioritizing the DataManager cache.
     * If not found in cache, it fetches from Foundry.
     */
    async getCompendiumItem(client: any, uuid: string): Promise<any | null> {
        let doc = await _dataManager.getDocument(uuid, client);
        if (doc) return doc;

        // Remote fetch (Socket)
        try {
            return await client.fetchByUuid(uuid);
        } catch (e) {
            logger.warn(`[ShadowdarkAdapter] Failed to fetch compendium item ${uuid}: ${e}`);
            return null;
        }
    }

    /**
     * Required for manifest-based initialization.
     * Fires off dynamic imports at boot time and caches them locally to avoid
     * static import leaks into the browser bundle.
     */
    async initialize(client?: any): Promise<void> {
        logger.info('[ShadowdarkAdapter] Initializing Phase 4 Service Layer...');

        // Populate internal module references
        const [caching, normalization, discovery, data] = await Promise.all([
            import('./caching'),
            import('./normalization'),
            import('./discovery'),
            import('../data/DataManager')
        ]);

        _ShadowdarkCache = caching.ShadowdarkCache;
        _ShadowdarkNormalizer = normalization.ShadowdarkNormalizer;
        _resolveDocumentName = normalization.resolveDocumentName;
        _ShadowdarkDiscovery = discovery.ShadowdarkDiscovery;
        _dataManager = data.dataManager;

        if (client) await this.getSystemData(client);
    }
}

export const shadowdarkAdapter = ShadowdarkAdapter.getInstance();
