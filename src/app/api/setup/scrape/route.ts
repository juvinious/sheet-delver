export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { SetupScraper } from '@/lib/foundry/SetupScraper';
import { SetupToken } from '@/lib/security/SetupToken';
import { loadConfig } from '@/lib/config';

// Rate limiting (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }

    record.count++;
    return true;
}

export async function POST(request: NextRequest) {
    try {
        // 1. Rate limiting
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429 }
            );
        }

        // 2. Token validation (relaxed in development)
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        const isDev = process.env.NODE_ENV === 'development';

        if (!isDev) {
            // Strict validation in production
            if (!token || !SetupToken.validate(token)) {
                return NextResponse.json(
                    { error: 'Invalid or expired setup token' },
                    { status: 403 }
                );
            }
        } else {
            // In development, just check if token exists (hot-reload resets in-memory tokens)
            if (!token) {
                return NextResponse.json(
                    { error: 'Setup token is required' },
                    { status: 403 }
                );
            }
        }

        // 3. Get session cookie from request body
        const body = await request.json();
        const { sessionCookie } = body;

        if (!sessionCookie) {
            return NextResponse.json(
                { error: 'Session cookie is required' },
                { status: 400 }
            );
        }

        // 4. Scrape world data
        const config = await loadConfig();
        if (!config) {
            return NextResponse.json(
                { error: 'Failed to load configuration' },
                { status: 500 }
            );
        }

        const worldData = await SetupScraper.scrapeWorldData(config.foundry.url, sessionCookie);

        // 5. Save to cache
        await SetupScraper.saveCache(worldData);

        // 6. Invalidate token after successful scrape
        SetupToken.invalidate();

        // 7. Return scraped data
        return NextResponse.json({
            success: true,
            data: worldData
        });

    } catch (error: any) {
        console.error('[Setup Scrape] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to scrape world data' },
            { status: 500 }
        );
    }
}
