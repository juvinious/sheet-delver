import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json(
                { error: 'Not connected to Foundry' },
                { status: 503 }
            );
        }

        const body = await request.json();
        console.log('[UPDATE] Actor ID:', id);
        console.log('[UPDATE] Update data:', JSON.stringify(body, null, 2));

        const result = await client.updateActor(id, body);
        console.log('[UPDATE] Result from Foundry:', JSON.stringify(result, null, 2));

        if (result.error) {
            console.log('[UPDATE] Error:', result.error);
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        console.log('[UPDATE] Success!');
        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('[UPDATE] Exception:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
