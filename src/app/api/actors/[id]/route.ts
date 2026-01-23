import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { getClient } from '@/lib/foundry/instance';
import { CompendiumCache } from '@/lib/foundry/compendium-cache';
import { getMatchingAdapter } from '@/modules/core/registry';
import { loadConfig } from '@/lib/config';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const client = getClient();
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected' }, { status: 503 });
    }

    const { id } = await params;
    const actor = await client.getActor(id);

    // Check for "System Not Ready" or other backend-side errors returned as an object
    // e.g. { error: "window.game.actors is undefined", state: "..." }
    if (!actor || actor.error) {
        // If specific error from backend, likely 503 (Not Ready/Disconnected)
        if (actor?.error) {
            return NextResponse.json({ error: actor.error }, { status: 503 });
        }
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


    // Use the Registry's matcher logic to find the best adapter for this actor data
    const adapter = getMatchingAdapter(resolvedActor);
    const finalSystemId = adapter.systemId;

    // REFETCH if we detected a different system than what was likely used (Generic)
    // The MorkBorgAdapter produces specific computed structures (actor.computed) that the sheet needs.
    // If we originally fetched with GenericAdapter, that structure is missing.
    // NOTE: This check might be redundant if getActor auto-detects, but good for safety.
    if (finalSystemId === 'morkborg' && (!actor.computed || actor.systemId !== 'morkborg')) {
        console.log(`[API] Re-fetching actor ${id} with MorkBorgAdapter`);
        const reFetched = await client.getActor(id, 'morkborg');
        if (reFetched) {
            // Merge or replace
            Object.assign(actor, reFetched);
        }
    }

    // CRITICAL: Normalize data using the adapter to generate the 'details' structure
    const normalizedActor = adapter.normalizeActorData(resolvedActor);

    // Return data directly from client (which now uses SystemAdapter)
    const config = await loadConfig();
    return NextResponse.json({
        ...normalizedActor,
        foundryUrl: client.url,
        // Ensure systemId is preserved
        systemId: finalSystemId,
        debugLevel: config?.debug?.level ?? 1
    });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const client = getClient();
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected' }, { status: 503 });
    }

    const { id } = await params;
    const actor = await client.getActor(id);

    if (!actor) {
        return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }

    try {
        try {
            if (typeof client.deleteActor === 'function') {
                await client.deleteActor(id);
            } else {
                // Fallback if HMR didn't update class prototype
                if (!client.page || client.page.isClosed()) throw new Error('Not connected');
                await client.page.evaluate(async (actorId) => {
                    // @ts-ignore
                    const actor = window.game.actors.get(actorId);
                    if (!actor) throw new Error('Actor not found');
                    await actor.delete();
                }, id);
            }
        } catch (e: any) {
            // Check for permission error and swallow it
            const msg = e.message || e.toString();
            if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('lacks permission')) {
                console.warn(`[API] Delete Actor ${id} Permission denied, treating as success for UI flow.`);
                return NextResponse.json({ success: true, warning: 'Permission denied, actor may remain' });
            }
            throw e; // Rethrow other errors to be caught by outer block
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error(`[API] Delete Actor ${id} Failed:`, e);
        return NextResponse.json({ error: e.message || 'Failed to delete' }, { status: 500 });
    }
}
