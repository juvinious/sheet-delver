import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const data = await coreFetch(`/actors/${id}`);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error(`[API] Get Actor ${request.url} Proxy Error:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const data = await coreFetch(`/actors/${id}`, { method: 'DELETE' });
        return NextResponse.json(data);
    } catch (error: any) {
        console.error(`[API] Delete Actor ${request.url} Proxy Error:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
