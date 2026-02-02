import { NextRequest, NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const uuid = searchParams.get('uuid');
        const data = await coreFetch(`/foundry/document?uuid=${uuid}`);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
