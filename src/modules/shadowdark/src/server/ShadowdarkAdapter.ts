import { SystemAdapter } from '@modules/registry/types';
import { ActorSheetData } from '@shared/interfaces';
import { normalizeItemData } from '../logic/rules';
import { logger } from '@shared/utils/logger';
import { isClassSpellcaster } from '../logic/rules';
import { shadowdarkTheme } from '../ui/themes/shadowdark';

// Unified Service Layer Static Imports
import { ShadowdarkCache } from '../logic/caching';
import { ShadowdarkNormalizer, resolveDocumentName } from '../logic/normalization';
import { dataManager } from '../data/DataManager';
import { PersistentCache, persistentCache } from '@core/cache/PersistentCache';
import { getInitiativeFormula } from '../logic/rules';

/**
 * ShadowdarkAdapter is the primary entry point for the Shadowdark module.
 * It follows a facade pattern, delegating specialized logic to sub-services.
 * 
 * Refactored to use unified static imports to ensure singleton integrity 
 * across Discovery, Normalization, and Caching.
 */
export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';
    private static instance: ShadowdarkAdapter;
    private _cache = ShadowdarkCache.getInstance();

    theme = shadowdarkTheme.colors;

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
        return getInitiativeFormula(actor);
    }

    /**
     * Resolves high-level card data for world-level actor previews (Dashboard).
     */
    getActorCardData(actor: any): any {
        const s = actor.system || {};
        const names = actor.computed?.resolvedNames || {};

        const resolve = (val: any) => {
            return resolveDocumentName(val, this._cache.systemData);
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
        const cached = this._cache.getActor(actorId);
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
            _theme: this.theme, // Inject theme for normalization
            items: (actorData.items || []).map((item: any) => normalizeItemData(item))
        };

        await ShadowdarkNormalizer.resolveActorNames(actor, systemData);
        const normalized = ShadowdarkNormalizer.normalizeActorData(actor, systemData);

        this._cache.setActor(actorId, normalized);
        return normalized;
    }

    /**
     * Fetches and caches system-wide data (Classes, Spells, etc.)
     */
    async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        return this._cache.loadSystemData(persistentCache);
    }

    /**
     * Delegated normalization logic.
     */
    normalizeActorData(actor: any, _client?: any): ActorSheetData {
        // Ensure theme is available during normalization
        if (actor && !actor._theme) actor._theme = this.theme;
        return ShadowdarkNormalizer.normalizeActorData(actor, this._cache.systemData);
    }

    /**
     * Delegated name resolution logic.
     */
    async resolveActorNames(actor: any, clientOrCache: any): Promise<void> {
        let systemData = this._cache.systemData;

        if (!systemData && clientOrCache && typeof clientOrCache.getSystem === 'function') {
            systemData = await this.getSystemData(clientOrCache);
        }

        return ShadowdarkNormalizer.resolveActorNames(actor, systemData);
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
                availableSpells = await dataManager.getSpellsBySource(classDoc.name);
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
        let doc = await dataManager.getDocument(uuid, client);
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
     */
    async initialize(client?: any): Promise<void> {
        logger.info('[ShadowdarkAdapter] Service Layer Unified.');
        if (client) await this.getSystemData(client);
    }
}

export const shadowdarkAdapter = ShadowdarkAdapter.getInstance();

export { ShadowdarkAdapter as Adapter };
