
import { NextResponse } from 'next/server';
import { getClient } from '@/core/foundry/instance';
import { dataManager } from '../data/DataManager';
import { getConfig } from '@/core/config';

/**
 * POST /api/modules/shadowdark/actors/[id]/spells/learn
 * Learn a spell by UUID
 */
/**
 * POST /api/modules/shadowdark/actors/[id]/spells/learn
 * Learn a spell by UUID or ID
 */
export async function handleLearnSpell(actorId: string, request: Request, client?: any) {
    try {
        const foundryClient = client || getClient();
        if (!foundryClient || !foundryClient.isConnected) {
            console.warn(`[API] Learn Spell Failed: Client disconnected. Provided Client: ${!!client}, Global Client: ${!!getClient()}`);
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { spellUuid } = await request.json();

        if (!spellUuid) {
            return NextResponse.json({ error: 'Spell UUID is required' }, { status: 400 });
        }

        // 1. Fetch Spell Data (Local or Remote)
        let spellData: any = null;

        // Try Local First
        if (spellUuid.startsWith('Compendium.')) {
            spellData = await dataManager.getDocument(spellUuid);
        }

        // Fallback to Remote
        if (!spellData) {
            spellData = await foundryClient.fetchByUuid(spellUuid);
        }

        if (!spellData) {
            return NextResponse.json({ error: 'Spell not found' }, { status: 404 });
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

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        console.error('[API] Learn Spell Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to learn spell' }, { status: 500 });
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
            return NextResponse.json({ error: 'Source parameter is required (e.g. Wizard)' }, { status: 400 });
        }

        const normalizedSource = source.toLowerCase();

        // 1. Fetch Local Spells (Offline Capable)
        const localSpells = await dataManager.getSpellsBySource(source);

        // 2. Fetch Remote Spells (Foundry)
        const client = getClient();
        let remoteSpells: any[] = [];
        const remoteSpellIds = new Set<string>();

        if (client && client.isConnected) {
            try {
                // Fetch World Spells
                const worldItems = await client.dispatchDocumentSocket('Item', 'get', { broadcast: false });
                const worldSpells = (worldItems?.result || []).filter((i: any) => i.type === 'Spell');

                // Fetch Compendium Spells (Indices)
                const packs = await client.getAllCompendiumIndices();
                const compendiumSpells: any[] = [];

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
                console.warn('[API] Failed to fetch remote spells:', err);
            }
        }

        // 3. Merge and Deduplicate
        // Priority: Local (Fast/Standard) -> Remote (Custom/World)
        // Actually, we usually want to show all unique spells.
        // If a spell exists in both (same UUID or Name + Tier), which wins?
        // Let's key by Name + Tier to avoid duplicates like "Light (Tier 0)" vs "Light (Tier 0)"

        const spellMap = new Map<string, any>();

        const addToMap = (spells: any[], origin: string) => {
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

        return NextResponse.json({ success: true, spells: merged });

    } catch (error: any) {
        console.error('[API] Fetch Spells Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
/**
 * GET /api/modules/shadowdark/actors/[id]/spellcaster
 */
export async function handleGetSpellcasterInfo(actorId: string, clientOverride?: any) {
    try {
        const client = clientOverride || getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const actor = await client.getActor(actorId);
        if (!actor) {
            return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
        }

        // Logical check similar to system.ts normalizeActorData
        let isCaster = false;
        let canMagic = false;

        const items = actor.items || [];
        const classItem = items.find((i: any) => i.type === 'Class');

        // Heuristics for detection
        if (classItem) {
            const spellcasting = classItem.system?.spellcasting;
            if (spellcasting?.ability || spellcasting?.class) {
                isCaster = true;
            }

            const clsName = (classItem.name || "").toLowerCase();
            const casterClasses = ["wizard", "priest", "seer", "shaman", "witch", "druid", "warlock"];
            if (casterClasses.some(c => clsName.includes(c))) {
                isCaster = true;
            }
        }

        // Check for spells
        if (items.some((i: any) => (i.type || "").toLowerCase() === 'spell')) {
            isCaster = true;
        }

        // Check for specific talents (Spellcasting)
        if (items.some((i: any) => i.type === 'Talent' && (i.name || "").toLowerCase().includes('spellcasting'))) {
            isCaster = true;
        }

        // Check for Magic Items (Scrolls/Wands)
        if (items.some((i: any) => {
            const type = (i.type || "").toLowerCase();
            const name = (i.name || "").toLowerCase();
            return type === 'scroll' || type === 'wand' || name.includes('scroll') || name.includes('wand');
        })) {
            canMagic = true;
        }

        return NextResponse.json({
            isSpellcaster: isCaster,
            canUseMagicItems: canMagic,
            showSpellsTab: isCaster || canMagic
        });

    } catch (error: any) {
        console.error('[API] Spellcaster Info Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to get spellcaster info' }, { status: 500 });
    }
}
