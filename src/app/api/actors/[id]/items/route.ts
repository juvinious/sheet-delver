
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const url = new URL(req.url);
    const itemId = url.searchParams.get('itemId');

    if (!id || !itemId) {
        return NextResponse.json({ success: false, error: 'Missing properties' }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
        return NextResponse.json({ success: false, error: 'Not connected to Foundry' }, { status: 400 });
    }

    try {
        try {
            await client.deleteActorItem(id, itemId);
            return NextResponse.json({ success: true });
        } catch (e: any) {
            console.error(e);
            return NextResponse.json({ success: false, error: e.message }, { status: 500 });
        }
    }
