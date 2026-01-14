import { NextResponse } from 'next/server';
import { FoundryClient } from '@/lib/foundry/client';
import { getClient, setClient } from '@/lib/foundry/instance';
import { loadConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET() {
    const config = await loadConfig();
    if (!config) {
        return NextResponse.json({ connected: false, error: 'Could not load configuration' });
    }

    const { url } = config.foundry;
    const appVersion = config.app.version;
    const existingClient = getClient();

    // Check existing connection
    if (existingClient && existingClient.isConnected) {
        try {
            await logger.debug('Checking existing connection...');
            const users = await existingClient.getUsers();
            const system = await existingClient.getSystem().catch(() => null);
            return NextResponse.json({ connected: true, users, system, url: existingClient.url, appVersion });
        } catch (e) {
            await logger.warn('Existing connection check failed, trying to reconnect...');
        }
    }

    // Try auto-connect
    if (url) {
        try {
            await logger.info('Initializing new FoundryClient connection to', url);
            const client = new FoundryClient({
                url: url,
                headless: true
            });
            await client.connect();
            setClient(client);

            // Auto-Login removed as per user request (foundryUser is for utility scripts only)


            const users = await client.getUsers();
            const system = await client.getSystem().catch(() => null);
            return NextResponse.json({ connected: true, users, system, url: url, auto: true, appVersion });
        } catch (error: any) {
            await logger.error('Auto-connect failed', error);
            return NextResponse.json({ connected: false, error: 'Auto-connect failed: ' + error.message, appVersion });
        }
    }

    return NextResponse.json({ connected: false, appVersion });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { url } = body;

        let client = getClient();

        // If we want to force a new connection or different URL
        if (!client || client.url !== url || !client.isConnected) {
            await logger.info('Establishing new connection via POST request to', url);
            client = new FoundryClient({
                url,
                headless: true
            });
            await client.connect();
            setClient(client);
        }

        const users = await client.getUsers();
        const system = await client.getSystem().catch(() => null);

        const config = await loadConfig();
        const appVersion = config?.app.version || '0.0.0';

        return NextResponse.json({ success: true, users, system, appVersion });
    } catch (error: any) {
        await logger.error('POST connection failed', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
