
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

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
