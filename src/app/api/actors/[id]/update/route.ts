import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data = await coreFetch(`/actors/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body)
        });
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
