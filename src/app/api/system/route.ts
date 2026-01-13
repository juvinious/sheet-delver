import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function GET() {
    const client = getClient();
    if (!client) {
        return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    try {
        const system = await client.getSystem();
        return NextResponse.json({ system });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
