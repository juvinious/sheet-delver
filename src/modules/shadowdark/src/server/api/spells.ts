import { getClient } from '@core/foundry/instance';
import { logger } from '@shared/utils/logger';
import { getConfig } from '@core/config';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';
import { shadowdarkAdapter } from '../../server/ShadowdarkAdapter';

/**
 * POST /api/modules/shadowdark/actors/[id]/spells/learn
 * Learn a spell by UUID or ID
 */
export async function handleLearnSpell(actorId: string, request: Request, client?: RouteFoundryClient | null) {
    try {
        const foundryClient = client || getClient();
        if (!foundryClient || !foundryClient.isConnected) {
            logger.warn(`[API] Learn Spell Failed: Client disconnected. Provided Client: ${!!client}, Global Client: ${!!getClient()}`);
            return Response.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { spellUuid } = await request.json();

        if (!spellUuid) {
            return Response.json({ error: 'Spell UUID is required' }, { status: 400 });
        }

        // 1. Fetch Spell Data (Unified Resolver)
        const spellData = await shadowdarkAdapter.resolveDocument(foundryClient, spellUuid);

        if (!spellData) {
            return Response.json({ error: 'Spell not found' }, { status: 404 });
        }

        // 2. Create Item on Actor
        const creationData = {
            name: spellData.name,
            type: 'Spell',
            img: spellData.img,
            system: spellData.system,
            flags: {
                core: { sourceId: spellUuid } // Link back to source
            }
        };

        const result = await foundryClient.createActorItem(actorId, creationData);

        return Response.json({ success: true, data: result });

    } catch (error: unknown) {
        logger.error('[API] Learn Spell Error:', error);
        return Response.json({ error: getErrorMessage(error) || 'Failed to learn spell' }, { status: 500 });
    }
}

/**
 * GET /api/modules/shadowdark/spells/list?source=...
 * Fetch spells filtered by class source (e.g. "Wizard")
 */
export async function handleGetSpellsBySource(request: Request) {
    try {
        const { searchParams } = new URL(request.url, getConfig().app.url);
        const source = searchParams.get('source'); // e.g. "Wizard", "Priest"

        if (!source) {
            return Response.json({ error: 'Source parameter is required (e.g. Wizard)' }, { status: 400 });
        }

        const normalizedSource = source.toLowerCase();

        // 1. Fetch Local Spells (Offline Capable)
        const localSpells = await shadowdarkAdapter.getSpellsBySource(source);

        // 2. Fetch Remote Spells (Foundry)
        const client = getClient();
        const remoteSpells: any[] = [];
        const remoteSpellIds = new Set<string>();

        if (client && client.isConnected) {
            try {
                // Fetch World Spells
                const worldItems = await client.dispatchDocumentSocket('Item', 'get', { broadcast: false });
                const worldSpells = (worldItems?.result || []).filter((i: any) => i.type === 'Spell');

                // Fetch Compendium Spells (Indices)
                const packs = await client.getAllCompendiumIndices();

                // Helper to check class match
                const checkClassMatch = (spellClasses: any) => {
                    const classes = Array.isArray(spellClasses) ? spellClasses : [spellClasses].filter(Boolean);
                    return classes.some((c: any) => {
                        const cStr = String(c).toLowerCase();
                        // Direct match
                        if (cStr === normalizedSource) return true;
                        // UUID match (heuristic)
                        if (cStr.includes(`.${normalizedSource}.`) || cStr.includes(`/${normalizedSource}/`)) return true;
                        return false;
                    });
                };

                // Process World Spells
                for (const s of worldSpells) {
                    if (checkClassMatch(s.system?.class)) {
                        remoteSpells.push({
                            name: s.name,
                            uuid: s.uuid || `Item.${s._id}`,
                            img: s.img,
                            tier: s.system?.tier || 0,
                            system: s.system,
                            source: 'world'
                        });
                    }
                }

                // Process Compendium Spells
                // We need to resolve names for UUIDs here if we want to filter by "Wizard"
                // But compendium index usually doesn't have "system.class" fully populated or resolved.
                // We rely on `DataManager` for the bulk of standard spells. 
                // Remote fetch is mostly for custom world items or non-SRD content.

                // However, user requested robustness. 
                // Let's iterate packs and check index metadata if available?
                // V10+ indices can include system fields.

                for (const pack of packs) {
                    const metadata = pack.metadata || {};
                    if (metadata.type !== 'Item' && metadata.entity !== 'Item') continue;

                    const index = pack.index || [];
                    for (const i of index) {
                        if (i.type !== 'Spell') continue;

                        // Check cached system data in index if available
                        const tier = i.system?.tier ?? i['system.tier'];
                        const classes = i.system?.class ?? i['system.class'];

                        if (classes && checkClassMatch(classes)) {
                            const uuid = `Compendium.${pack.id}.Item.${i._id}`;
                            if (!remoteSpellIds.has(uuid)) {
                                remoteSpells.push({
                                    name: i.name,
                                    uuid: uuid,
                                    img: i.img,
                                    tier: tier || 0,
                                    system: i.system || {},
                                    source: 'compendium'
                                });
                                remoteSpellIds.add(uuid);
                            }
                        }
                    }
                }

            } catch (err) {
                logger.warn('[API] Failed to fetch remote spells:', err);
            }
        }

        // 3. Merge and Deduplicate
        // Priority: Local (Fast/Standard) -> Remote (Custom/World)
        // Actually, we usually want to show all unique spells.
        // If a spell exists in both (same UUID or Name + Tier), which wins?
        // Let's key by Name + Tier to avoid duplicates like "Light (Tier 0)" vs "Light (Tier 0)"

        const spellMap = new Map<string, any>();

        const addToMap = (spells: any[], _origin: string) => {
            for (const s of spells) {
                const key = `${s.name}-${s.tier || 0}`;
                if (!spellMap.has(key)) {
                    spellMap.set(key, {
                        ...s,
                        // Ensure minimal fields
                        uuid: s.uuid || s._id,
                        tier: s.tier || s.system?.tier || 0,
                        img: s.img,
                        classes: [source] // We know it matches
                    });
                }
            }
        };

        addToMap(localSpells, 'local');
        addToMap(remoteSpells, 'remote');

        const merged = Array.from(spellMap.values()).sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            return a.name.localeCompare(b.name);
        });

        return Response.json({ success: true, spells: merged });

    } catch (error: unknown) {
        logger.error('[API] Fetch Spells Error:', error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
import { isSpellcaster, canUseMagicItems } from '../../logic/rules';

/**
 * GET /api/modules/shadowdark/actors/[id]/spellcaster
 *
 * Returns spellcaster info for an actor.
 * Uses the normalized actor from the adapter (which already handles caching and
 * name resolution internally) — no separate raw fetch is needed.
 */
export async function handleGetSpellcasterInfo(actorId: string, clientOverride?: RouteFoundryClient | null) {
    try {
        const client = clientOverride || getClient();
        if (!client || !client.isConnected) {
            return Response.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // getActor fetches, normalizes, resolves names, and caches — one operation.
        const normalizedActor = await shadowdarkAdapter.getActor(client, actorId);
        if (!normalizedActor || normalizedActor.error) {
            return Response.json({ error: 'Actor not found' }, { status: 404 });
        }

        // Unified spellcaster check using rules.ts (works on normalized actor).
        const isCaster = isSpellcaster(normalizedActor);
        const magicItemCaster = canUseMagicItems(normalizedActor);

        return Response.json({
            isSpellcaster: isCaster,
            canUseMagicItems: magicItemCaster,
            showSpellsTab: isCaster || magicItemCaster
        });

    } catch (error: unknown) {
        logger.error('[API] Spellcaster Info Error:', error);
        return Response.json({ error: getErrorMessage(error) || 'Failed to get spellcaster info' }, { status: 500 });
    }
}
