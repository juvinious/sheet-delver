
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const uuid = searchParams.get('uuid');

    if (!uuid) {
        return NextResponse.json({ error: 'Missing uuid parameter' }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
    }

    try {
        // Generic fetch for any Document (Item, Actor, RollTable, JournalEntry, etc.)
        const data = await client.evaluate(async (uuid) => {
            // @ts-ignore
            const doc = await fromUuid(uuid);
            if (!doc) return null;
            // Return clean object
            return doc.toObject();
        }, uuid);

        if (!data) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error(`[API] Error fetching document ${uuid}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
