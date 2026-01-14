
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const body = await req.json();
    const { effectId, updateData } = body;

    if (!id || !effectId || !updateData) {
        return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
        return NextResponse.json({ success: false, error: 'Not connected to Foundry' }, { status: 400 });
    }

    try {
        await client.updateActorEffect(id, effectId, updateData);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const url = new URL(req.url);
    const effectId = url.searchParams.get('effectId');

    if (!id || !effectId) {
        return NextResponse.json({ success: false, error: 'Missing properties' }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
        return NextResponse.json({ success: false, error: 'Not connected to Foundry' }, { status: 400 });
    }

    try {
        await client.deleteActorEffect(id, effectId);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
