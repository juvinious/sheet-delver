import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export async function GET() {
    try {
        const data = await coreFetch('/actors');
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const data = await coreFetch('/actors', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
