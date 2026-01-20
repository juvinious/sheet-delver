import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getClient } from '@/lib/foundry/instance';
import { getMatchingAdapter } from '@/modules/core/registry';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const client = getClient();
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected' }, { status: 503 });
    }

    const { id } = await params;
    const actor = await client.getActor(id);

    if (!actor) {
        return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }

    const adapter = getMatchingAdapter(actor);
    // @ts-ignore
    const effects = await adapter.getPredefinedEffects(client);

    return NextResponse.json({
        effects
    });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const client = getClient();
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected' }, { status: 503 });
    }

    const { id } = await params;
    const body = await request.json();
    const { effectKey } = body;

    // Use adapter to apply effect
    // Wait, the client usually applies effects directly or via generic effect API.
    // ShadowdarkAdapter doesn't strictly have "applyPredefinedEffect" yet, 
    // but the GenericAdapter has `toggleEffect` if it's on the actor.
    // Actually, `predefined-effects` usually implies Status Effects (CONFIG.statusEffects).
    // We can use the Foundry client to toggle a status effect.

    try {
        const success = await client.toggleStatusEffect(id, effectKey);
        return NextResponse.json({ success });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
