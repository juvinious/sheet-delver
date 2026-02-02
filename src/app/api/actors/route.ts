import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { getAdapter } from '@/modules/core/registry';
import { CompendiumCache } from '@/lib/foundry/compendium-cache';

export async function GET() {
    const client = getClient();

    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        // 1. Get current system ID and user ID
        const systemInfo = await client.getSystem();
        const adapter = getAdapter(systemInfo.id);

        if (!adapter) {
            throw new Error(`System adapter '${systemInfo.id}' not found`);
        }

        // Get current user ID
        const currentUserId = client.getCurrentUserId();

        // Get all users to check if current user is GM
        const allUsers = await client.getUsers();
        const currentUser = allUsers.find((u: any) => u._id === currentUserId);
        const isGM = currentUser?.role >= 4; // Role 4 = Gamemaster

        // 2. Fetch raw actors
        // const allActors = await client.getActors(); // Unused
        const rawActors = await client.getActors();

        // 3. Filter and group actors based on ownership
        const ownedActors: any[] = [];
        const readOnlyActors: any[] = [];

        rawActors.forEach((actor: any) => {
            // GMs see all actors as owned
            if (isGM) {
                ownedActors.push(actor);
                return;
            }

            // If no user ID, skip
            if (!currentUserId) return;

            const ownership = actor.ownership || {};

            // Debug first few actors
            if (rawActors.indexOf(actor) < 3) {
                console.log(`[Actors API] Actor "${actor.name}" - Type: ${actor.type} - Ownership:`, ownership);
            }

            // Check if user has OWNER permission (level 3)
            if (ownership[currentUserId] >= 3) {
                ownedActors.push(actor);
            }
            // Check if user has OBSERVER permission (level 2) via default or explicit
            else if (ownership[currentUserId] >= 2 || ownership.default >= 2) {
                readOnlyActors.push(actor);
            }
        });

        const allActors = [...ownedActors, ...readOnlyActors];
        console.log(`[Actors API] User ${currentUser?.name} (${currentUserId}) - Role: ${currentUser?.role} - Total: ${rawActors.length}, Owned: ${ownedActors.length}, Read-Only: ${readOnlyActors.length}`);

        // Use CompendiumCache as fallback/primary resolver
        const cache = CompendiumCache.getInstance();
        if (!cache.hasLoaded()) {
            await cache.initialize(client);
        }

        // 4. Normalize all actors
        const normalizedOwned = await Promise.all(ownedActors.map(async (actor: any) => {
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
            if (adapter.resolveActorNames) {
                adapter.resolveActorNames(actor, cache);
            }
            return adapter.normalizeActorData(actor);
        }));

        const normalizedReadOnly = await Promise.all(readOnlyActors.map(async (actor: any) => {
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
            if (adapter.resolveActorNames) {
                adapter.resolveActorNames(actor, cache);
            }
            return adapter.normalizeActorData(actor);
        }));

        return NextResponse.json({
            actors: normalizedOwned, // Keep for backward compatibility
            ownedActors: normalizedOwned,
            readOnlyActors: normalizedReadOnly,
            system: systemInfo.id
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const client = getClient();
    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
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
