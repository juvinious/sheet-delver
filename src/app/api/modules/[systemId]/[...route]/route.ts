
import { NextResponse } from 'next/server';
import { serverModules } from '@/modules/core/server-modules';

// Catch-all handler for module APIs
async function handler(request: Request, { params }: { params: Promise<{ systemId: string, route: string[] }> }) {
    const { systemId, route } = await params;
    const routePath = route.join('/');

    // 1. Resolve Server Module
    const module = serverModules[systemId];

    if (!module) {
        return NextResponse.json({ error: `System '${systemId}' not found or not loaded` }, { status: 404 });
    }

    // 2. Resolve Route Handler
    if (!module.apiRoutes || !module.apiRoutes[routePath]) {
        return NextResponse.json({ error: `Route '${routePath}' not found in system '${systemId}'` }, { status: 404 });
    }

    // 3. Execute Handler
    try {
        const handlerFn = module.apiRoutes[routePath];
        return await handlerFn(request, { params });
    } catch (e: any) {
        console.error(`[API] Module Error (${systemId}/${routePath}):`, e);
        return NextResponse.json({ error: e.message || 'Internal Module Error' }, { status: 500 });
    }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
