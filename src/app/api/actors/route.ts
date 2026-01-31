import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { getAdapter } from '@/modules/core/registry';
import { CompendiumCache } from '@/lib/foundry/compendium-cache';

export async function GET() {
    const client = getClient();

    if (!client) {
        return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    try {
        // 1. Get current system ID
        const systemInfo = await client.getSystem();
        const adapter = getAdapter(systemInfo.id);

        if (!adapter) {
            throw new Error(`System adapter '${systemInfo.id}' not found`);
        }

        // 2. Fetch raw actors
        const rawActors = await client.getActors(); // client actually returns a partial structure we defined, but let's assume it passes through 'system'

        // DEBUG: Check first actor for computed data


        // Use CompendiumCache as fallback/primary resolver
        // Browser-side fromUuid can be flaky if packs aren't loaded in the view
        const cache = CompendiumCache.getInstance();
        if (!cache.hasLoaded()) {
            await cache.initialize(client);
        }

        // 3. Normalize
        const actors = await Promise.all(rawActors.map(async (actor: any) => {
            // Ensure computed exists
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};

            // Delegate system-specific name resolution to the adapter
            if (adapter.resolveActorNames) {
                adapter.resolveActorNames(actor, cache);
            }

            return adapter.normalizeActorData(actor);
        }));

        return NextResponse.json({ actors, system: systemInfo.id });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const client = getClient();
    if (!client) {
        return NextResponse.json({ error: 'Not connected' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const result = await client.createActor(body);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
