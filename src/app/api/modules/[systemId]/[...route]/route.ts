
import { NextResponse } from 'next/server';
import { serverModules } from '@/modules/core/server-modules';

// Catch-all handler for module APIs
async function handler(request: Request, { params }: { params: Promise<{ systemId: string, route: string[] }> }) {
    const { systemId, route } = await params;
    const routePath = route.join('/');

    // 1. Resolve Server Module
    const sysModule = serverModules[systemId];

    if (!sysModule) {
        return NextResponse.json({ error: `System '${systemId}' not found or not loaded` }, { status: 404 });
    }

    // 2. Resolve Route Handler
    // Helper to match route pattern (e.g. "actors/[id]/level-up/roll-hp") against actual path segments
    const matchRoute = (pattern: string, actualSegments: string[]) => {
        const patternSegments = pattern.split('/');
        if (patternSegments.length !== actualSegments.length) return false;

        for (let i = 0; i < patternSegments.length; i++) {
            const p = patternSegments[i];
            const a = actualSegments[i];
            if (p.startsWith('[') && p.endsWith(']')) continue; // Wildcard
            if (p !== a) return false;
        }
        return true;
    };

    let matchedPattern: string | null = null;

    // Direct match check first
    if (sysModule.apiRoutes && sysModule.apiRoutes[routePath]) {
        matchedPattern = routePath;
    } else if (sysModule.apiRoutes) {
        // Iterate to find dynamic match
        for (const pattern of Object.keys(sysModule.apiRoutes)) {
            if (matchRoute(pattern, route)) {
                matchedPattern = pattern;
                break;
            }
        }
    }

    if (!matchedPattern || !sysModule.apiRoutes || !sysModule.apiRoutes[matchedPattern]) {
        return NextResponse.json({ error: `Route '${routePath}' not found in system '${systemId}'` }, { status: 404 });
    }

    // 3. Execute Handler
    try {
        const handlerFn = sysModule.apiRoutes[matchedPattern];
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
