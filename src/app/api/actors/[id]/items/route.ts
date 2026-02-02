
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
    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ success: false, error: 'Not logged in' }, { status: 401 });
    }

    try {
        await client.deleteActorItem(id, itemId);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ success: false, error: 'Missing actor ID' }, { status: 400 });
    }

    let itemData;
    try {
        itemData = await req.json();
    } catch (_e) {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!itemData) {
        return NextResponse.json({ success: false, error: 'Missing item data' }, { status: 400 });
    }

    console.log('[API] Creating Item for', id, JSON.stringify(itemData));

    const client = getClient();
    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ success: false, error: 'Not logged in' }, { status: 401 });
    }

    try {
        const newItemId = await client.createActorItem(id, itemData);
        console.log('[API] Item Created:', newItemId);
        return NextResponse.json({ success: true, id: newItemId });
    } catch (e: any) {
        console.error('[API] Create Item Failed:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ success: false, error: 'Missing actor ID' }, { status: 400 });
    }

    let itemData;
    try {
        itemData = await req.json();
    } catch (_e) {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!itemData || (!itemData._id && !itemData.id)) {
        return NextResponse.json({ success: false, error: 'Missing item ID in data' }, { status: 400 });
    }

    const client = getClient();
    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ success: false, error: 'Not logged in' }, { status: 401 });
    }

    try {
        // Normalize ID
        const itemId = itemData._id || itemData.id;

        // Ensure _id exists for Foundry
        if (!itemData._id) itemData._id = itemId;

        await client.updateActorItem(id, itemData);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[API] Update Item Failed:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
