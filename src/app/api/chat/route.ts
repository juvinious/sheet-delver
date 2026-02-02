import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { loadConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getClient();

    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const config = await loadConfig();
        const limit = config?.app.chatHistory || 25;

        const messages = await client.getChatLog(limit);

        return NextResponse.json({ messages });
    } catch (error: any) {
        await logger.error('API/Chat Error', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

