import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function POST(request: Request) {
    const client = getClient();

    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { message } = body;

        // Simple validation
        if (!message) {
            return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
        }

        // Determine if it's a roll or a chat
        // If it starts with /r or /roll, use the roll method
        if (message.trim().match(/^\/(r|roll)\s/)) {
            const result = await client.roll(message);
            return NextResponse.json({ success: true, type: 'roll', result });
        } else {
            // Otherwise, just send it as a message
            await client.sendMessage(message);
            return NextResponse.json({ success: true, type: 'chat' });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
