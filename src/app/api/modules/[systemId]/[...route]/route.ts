import { NextResponse } from 'next/server';
import { coreFetch } from '@/app/lib/core-api';

async function handler(request: Request, { params }: { params: Promise<{ systemId: string, route: string[] }> }) {
    try {
        const { systemId, route } = await params;
        const routePath = route.join('/');

        let body;
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
            body = await request.json().catch(() => ({}));
        }

        const data = await coreFetch(`/modules/${systemId}/${routePath}`, {
            method: request.method,
            body: body ? JSON.stringify(body) : undefined
        });

        return NextResponse.json(data);
    } catch (e: any) {
        console.error(`[API] Module Proxy Error:`, e.message);
        return NextResponse.json({ error: e.message || 'Internal Proxy Error' }, { status: 500 });
    }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
