import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';
import { logger } from '@/core/logger';

export async function GET() {
    try {
        const data = await coreFetch('/status');
        return NextResponse.json(data);
    } catch (error: any) {
        logger.error('[API Connect] Proxy GET failed:', error.message);
        return NextResponse.json({
            connected: false,
            error: error.message,
            status: 'offline'
        });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        // We preserve the POST interface for compatibility, 
        // but the Core Service manages the underlying connection.
        const data = await coreFetch('/status', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return NextResponse.json({ success: true, ...data });
    } catch (error: any) {
        logger.error('[API Connect] Proxy POST failed:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
