import { NextRequest, NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionCookie } = body;

        if (!sessionCookie) {
            return NextResponse.json({ error: 'Session cookie is required' }, { status: 400 });
        }

        // Proxy to the Core Service's ADMIN scrape endpoint
        const data = await coreFetch('/scrape', {
            method: 'POST',
            body: JSON.stringify({ sessionCookie }),
            admin: true // This uses the /admin base path
        });

        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[Setup Scrape Proxy] Error:', error.message);
        return NextResponse.json(
            { error: error.message || 'Failed to scrape world data' },
            { status: 500 }
        );
    }
}
