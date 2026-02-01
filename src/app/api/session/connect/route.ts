import { NextResponse } from 'next/server';
import { createFoundryClient } from '@/lib/foundry';
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
            // Verify connection is actually alive by fetching system info
            const system: any = await existingClient.getSystem().catch(() => null);
            if (system && system.id) {
                system.config = getConfig(system.id);
            }
            // If setup, don't bother with users
            const users = (system?.id === 'setup') ? [] : await existingClient.getUsers().catch(() => []);

            return NextResponse.json({ connected: existingClient.isConnected, users, system, url: existingClient.url, appVersion });
        } catch (error) {
            await logger.warn('Existing connection check failed, connection may be flaky.', error);
            // We DO NOT call disconnect() here anymore. Let SocketClient handle reconnection internally.
            return NextResponse.json({ connected: existingClient.isConnected, error: 'Connection flaky', appVersion });
        }
    }

    // Try auto-connect
    if (url) {
        // [Security Fix] If a client already exists, we should return its status
        // rather than attempting to create a new session or clobbering it.
        if (existingClient) {
            try {
                const system: any = await existingClient.getSystem().catch(() => null);
                if (system && system.id) system.config = getConfig(system.id);
                const users = (system?.id === 'setup') ? [] : await existingClient.getUsers().catch(() => []);

                return NextResponse.json({
                    connected: existingClient.isConnected,
                    users,
                    system,
                    url: existingClient.url,
                    appVersion
                });
            } catch (e) {
                // If existing client is broken, fall through to new auto-connect
                await logger.warn('Existing client check failed during connect. Attempting fresh auto-connect.', e);
                existingClient.disconnect();
            }
        }

        try {
            await logger.info('Initializing new FoundryClient connection to', url);
            const client = createFoundryClient({
                ...config.foundry
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
                url
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
