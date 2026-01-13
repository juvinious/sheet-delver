import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { loadConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getClient();

    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    try {
        const config = await loadConfig();
        const limit = config?.config['chat-history'] || 25;

        const messages = await client.getChatLog(limit);
        if (messages.length > 0) {
            await logger.debug(`API/Chat Debug:`, JSON.stringify(messages[0].debug, null, 2));
        }
        await logger.info(`API/Chat: Limit=${limit}, Count=${messages.length}`);
        return NextResponse.json({ messages });
    } catch (error: any) {
        await logger.error('API/Chat Error', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

