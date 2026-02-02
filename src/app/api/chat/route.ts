import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await coreFetch('/chat');
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

