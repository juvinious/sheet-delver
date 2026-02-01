
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

        return NextResponse.json({ error: 'Learning spells by UUID is not supported in Socket mode.' }, { status: 501 });

        /*
        const result = await client.page!.evaluate(async ({ actorId, spellUuid }) => {
            // ... implementation ...
        }, { actorId, spellUuid });
        */

        return NextResponse.json({ success: true, data: {} });

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
        const spells = await dataManager.getSpellsBySource(source);
        if (spells && spells.length > 0) {
            return NextResponse.json({ success: true, spells });
        }

        // 2. Fallback to Foundry (Requires Connection)
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // Fallback to Foundry if local data missing (e.g. custom class)
        return NextResponse.json({ error: 'Fetching spells from Foundry is not supported in Socket mode.' }, { status: 501 });

        /*
        const result = await client.page!.evaluate(async ({ source }) => {
            // ... implementation ...
        }, { source });
        */

        return NextResponse.json({ success: true, spells: [] });

    } catch (error: any) {
        console.error('[API] Fetch Spells Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
