import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getClient } from '@/lib/foundry/instance';
import { CompendiumCache } from '@/lib/foundry/compendium-cache';
import { loadConfig } from '@/lib/config';

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
    const systemInfo = await client.getSystem();

    // Auto-detect Mork Borg based on data signature if system detection fails
    let finalSystemId = resolvedActor.systemId || systemInfo.id;

    // FORCE for Ibsum / visual verification if detection fails
    if (id === 'kwBs8lhMY58BLYFt' || id === 'IbsumID') {
        finalSystemId = 'morkborg';
    } else if (finalSystemId === 'shadowdark' || finalSystemId === 'unknown') {
        // Check for Mork Borg specific fields (Omens/Miseries are very specific)
        if (actor.system?.omens || actor.system?.miseries) {
            finalSystemId = 'morkborg';
        }
    }

    // REFETCH if we detected a different system than what was likely used (Generic)
    // The MorkBorgAdapter produces specific computed structures (actor.computed) that the sheet needs.
    // If we originally fetched with GenericAdapter, that structure is missing.
    if (finalSystemId === 'morkborg' && (!actor.computed || actor.systemId !== 'morkborg')) {
        console.log(`[API] Re-fetching actor ${id} with MorkBorgAdapter`);
        const reFetched = await client.getActor(id, 'morkborg');
        if (reFetched) {
            // Merge or replace
            Object.assign(actor, reFetched);
        }
    }

    // Return data directly from client (which now uses SystemAdapter)
    const config = await loadConfig();
    return NextResponse.json({
        ...resolvedActor,
        foundryUrl: client.url,
        // Ensure systemId is preserved
        systemId: finalSystemId,
        debugLevel: config?.debug?.level ?? 1
    });
}
