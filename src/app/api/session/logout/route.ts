import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export async function POST() {
    try {
        const data = await coreFetch('/logout', { method: 'POST' });
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
