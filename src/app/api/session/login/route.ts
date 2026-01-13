import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function POST(request: Request) {
    const client = getClient();
    if (!client) {
        return NextResponse.json({ error: 'Not connected' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { username, password } = body;

        await client.login(username, password);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
