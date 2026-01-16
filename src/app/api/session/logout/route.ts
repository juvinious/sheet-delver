import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { logger } from '@/lib/logger';

export async function POST() {
    try {
        const client = getClient();
        if (client && client.isConnected) {
            await logger.info('Logging out active client session...');
            await client.logout();
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        await logger.error('Logout failed', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
