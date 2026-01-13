
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { loadConfig } from '@/lib/config';

export async function GET() {
    try {
        const config = await loadConfig();
        if (!config) {
            return NextResponse.json({ error: 'Configuration not loaded' }, { status: 500 });
        }

        const client = getClient();
        if (!client) {
            return NextResponse.json({ error: 'Foundry client not initialized' }, { status: 503 });
        }

        const data = await client.getSystemData();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching system data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
