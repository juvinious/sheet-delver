import { SystemAdapter, ActorSheetData } from '../core/interfaces';
import { normalizeItemData } from './rules';
import { logger } from '../../core/logger';
import { dataManager, DataManager } from './data/DataManager';
import { CompendiumCache } from '../../core/foundry/compendium-cache';
import { isClassSpellcaster } from './rules';
import { shadowdarkTheme } from './ui/themes/shadowdark';
import { ShadowdarkCache } from './caching';
import { ShadowdarkNormalizer } from './normalization';
import { ShadowdarkDiscovery } from './discovery';

/**
 * ShadowdarkAdapter is the primary entry point for the Shadowdark module.
 * It follows a facade pattern, delegating specialized logic to sub-services.
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
     */
    getActorCardData(actor: any): any {
        const s = actor.system || {};
        const names = actor.computed?.resolvedNames || {};
        const cache = ShadowdarkCache.getInstance();
        
        const resolveFallback = (val: any) => {
            if (!val || typeof val !== 'string') return '';
            if (!val.includes('.')) return val;
            
            const doc = dataManager.index.get(val);
            if (doc) return doc.name;

            if (cache.systemData) {
                for (const col of ['ancestries', 'classes', 'backgrounds']) {
                    const match = (cache.systemData[col] || []).find((i: any) => i.uuid === val || i.name === val);
                    if (match) return match.name;
                }
            }

            return val.split('.').pop()!.replace(/^[a-z]/, (c: string) => c.toUpperCase());
        };

        const ancestry = names.ancestry || resolveFallback(s.ancestry);
        const className = names.class || resolveFallback(s.class);
        const level = s.level?.value || 0;

        return {
            subtext: `${ancestry} ${className} ${level}`,
            ancestry: ancestry,
            class: className,
            level: level
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
        const cache = ShadowdarkCache.getInstance();
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

        await ShadowdarkNormalizer.resolveActorNames(actor, client);
        const normalized = ShadowdarkNormalizer.normalizeActorData(actor, systemData);

        cache.setActor(actorId, normalized);
        return normalized;
    }

    /**
     * Fetches and caches system-wide data (Classes, Spells, etc.)
     */
    async getSystemData(client: any, options?: { minimal?: boolean }): Promise<any> {
        return ShadowdarkDiscovery.getSystemData(client, options);
    }

    /**
     * Delegated normalization logic.
     */
    normalizeActorData(actor: any, client?: any): ActorSheetData {
        const cache = ShadowdarkCache.getInstance();
        return ShadowdarkNormalizer.normalizeActorData(actor, cache.systemData);
    }

    /**
     * Delegated name resolution logic.
     */
    async resolveActorNames(actor: any, client: any): Promise<void> {
        return ShadowdarkNormalizer.resolveActorNames(actor, client);
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

        if (classUuid) classDoc = await dataManager.getDocument(classUuid);
        if (patronUuid) patronDoc = await dataManager.getDocument(patronUuid);

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
                availableSpells = await dataManager.getAllDocuments();
                availableSpells = availableSpells.filter(d => d.documentType === 'Spell' && d.system?.class?.includes(classDoc.name));
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
        const doc = await dataManager.getDocument(uuid);
        if (doc) return doc;

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
    async initialize(client: any): Promise<void> {
        logger.info('[ShadowdarkAdapter] Initializing Phase 4 Service Layer...');
        await this.getSystemData(client);
    }
}

export const shadowdarkAdapter = ShadowdarkAdapter.getInstance();
