
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { dataManager } from '../data/DataManager';

/**
 * POST /api/modules/shadowdark/actors/[id]/spells/learn
 * Learn a spell by UUID
 */
export async function handleLearnSpell(actorId: string, request: Request) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { spellUuid } = await request.json();

        if (!spellUuid) {
            return NextResponse.json({ error: 'Spell UUID is required' }, { status: 400 });
        }

        const result = await client.page!.evaluate(async ({ actorId, spellUuid }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return { error: 'Actor not found' };

            // @ts-ignore
            const spell = await fromUuid(spellUuid);
            if (!spell) return { error: 'Spell not found' };

            // Create embedded document
            // We use toObject() to get cleaner data, but passing the object directly also works usually.
            // Explicitly handling it ensures we don't pass non-serializable data if any.
            const spellData = spell.toObject();

            // Create the item
            await actor.createEmbeddedDocuments('Item', [spellData]);

            return { success: true, name: spell.name };
        }, { actorId, spellUuid });

        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

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
        const { searchParams } = new URL(request.url);
        const source = searchParams.get('source'); // e.g. "Wizard", "Priest"

        if (!source) {
            return NextResponse.json({ error: 'Source parameter is required (e.g. Wizard)' }, { status: 400 });
        }

        // 1. Try Local Cache (Offline Capable)
        // @ts-ignore
        const spells = dataManager.getSpellsBySource(source);
        if (spells && spells.length > 0) {
            return NextResponse.json({ success: true, spells });
        }

        // 2. Fallback to Foundry (Requires Connection)
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // Fallback to Foundry if local data missing (e.g. custom class)
        const result = await client.page!.evaluate(async ({ source }) => {
            // @ts-ignore
            if (!window.shadowdark?.compendiums?.classSpellBook) {
                return { error: 'System method shadowdark.compendiums.classSpellBook not found' };
            }
            // ... (rest of old logic for fallback)
            // We can simplify this or keep it as backup.
            // keeping it as backup is safer.

            // We need to find the Class UUID for the given name
            // @ts-ignore
            const classItem = game.items.find(i => i.type === 'Class' && i.name.toLowerCase() === source.toLowerCase());
            // Also check packs if not in world
            let classUuid = classItem?.uuid;

            if (!classUuid) {
                // Try finding in packs
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;
                    // @ts-ignore
                    const index = pack.index.find(i => i.type === 'Class' && i.name.toLowerCase() === source.toLowerCase());
                    if (index) {
                        classUuid = `Compendium.${pack.collection}.${index._id}`;
                        break;
                    }
                }
            }

            if (!classUuid) return { error: `Class ${source} not found` };

            // @ts-ignore
            const spells = await window.shadowdark.compendiums.classSpellBook(classUuid);

            return spells.map((s: any) => {
                if (typeof s.toJSON === 'function') return s.toJSON();
                return s;
            });

        }, { source });

        if (result && result.error) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({ success: true, spells: result });

    } catch (error: any) {
        console.error('[API] Fetch Spells Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
