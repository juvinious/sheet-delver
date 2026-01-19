import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { getAdapter } from '@/modules/core/registry';

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

        // 3. Normalize
        const actors = rawActors.map((actor: any) => adapter.normalizeActorData(actor));

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
