import { NextRequest, NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const data = await coreFetch(`/actors/${id}/items`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const data = await coreFetch(`/actors/${id}/items`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const itemId = url.searchParams.get('itemId');
        const data = await coreFetch(`/actors/${id}/items?itemId=${itemId}`, {
            method: 'DELETE'
        });
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
