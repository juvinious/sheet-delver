import { NextResponse } from 'next/server';
import { createFoundryClient, FoundryClient } from '@/lib/foundry';
import { getClient, setClient } from '@/lib/foundry/instance';
import { loadConfig } from '@/lib/config';
import { logger } from '@/lib/logger';
import { getConfig } from '@/modules/core/registry';

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


            const system: any = await existingClient.getSystem().catch(() => null);
            if (system && system.id) {
                system.config = getConfig(system.id);
            }
            // If setup, don't bother with users
            const users = (system?.id === 'setup') ? [] : await existingClient.getUsers();

            return NextResponse.json({ connected: true, users, system, url: existingClient.url, appVersion });
        } catch {
            await logger.warn('Existing connection check failed, trying to reconnect...');
        }
    }

    // Try auto-connect
    if (url) {
        try {
            await logger.info('Initializing new FoundryClient connection to', url);
            const client = createFoundryClient({
                ...config.foundry,
                headless: true
            });
            await client.connect();
            setClient(client);

            setClient(client);

            // Auto-Login Removed via User Request
            // if (config.debug.foundryUser && config.debug.foundryUser.name) { ... }

            // Auto-Login Removed via User Request
            // if (config.debug.foundryUser && config.debug.foundryUser.name) { ... }

            const system: any = await client.getSystem().catch(() => null);
            if (system && system.id) {
                system.config = getConfig(system.id);
            }
            const users = (system?.id === 'setup') ? [] : await client.getUsers();

            return NextResponse.json({ connected: true, users, system, url: url, appVersion });
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
            client = createFoundryClient({
                url,
                headless: true
            });
            await client.connect();
            setClient(client);
        }

        const users = await client.getUsers();
        const system: any = await client.getSystem().catch(() => null);
        if (system && system.id) {
            system.config = getConfig(system.id);
        }

        const config = await loadConfig();
        const appVersion = config?.app.version || '0.0.0';

        return NextResponse.json({ success: true, users, system, appVersion });
    } catch (error: any) {
        await logger.error('POST connection failed', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
