import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = await coreFetch('/login', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Login proxy error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
