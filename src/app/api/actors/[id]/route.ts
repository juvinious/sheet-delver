import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getClient } from '@/lib/foundry/instance';
import { CompendiumCache } from '@/lib/foundry/compendium-cache';
import { getAdapter } from '@/lib/systems/factory';

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

    // Initialize cache if needed (lazy load)
    const cache = CompendiumCache.getInstance();
    await cache.initialize(client);

    // Recursively resolve UUIDs in string values
    const resolveUUIDs = (obj: any, keyName = ''): any => {
        if (typeof obj === 'string') {
            if (obj.startsWith('Compendium.')) {
                const name = cache.getName(obj);
                return name ? name : obj;
            }
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => resolveUUIDs(item, keyName));
        }
        if (typeof obj === 'object' && obj !== null) {
            const newObj: any = {};
            for (const key in obj) {
                newObj[key] = resolveUUIDs(obj[key], key);
            }
            return newObj;
        }
        return obj;
    };

    const resolvedActor = resolveUUIDs(actor);

    // Normalize using the System Adapter
    const systemInfo = await client.getSystem();
    const adapter = getAdapter(systemInfo.id);
    const normalized = adapter.normalizeActorData(resolvedActor);

    // Return normalized data mixed with debug raw data for the debug card
    return NextResponse.json({
        ...normalized,
        debug: resolvedActor, // Exposed for inspection if needed, but UI uses top-level props
        system: systemInfo.id,
        foundryUrl: client.url,
        currentUser: resolvedActor.currentUser
    });
}
