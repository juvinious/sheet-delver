import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export const dynamic = 'force-dynamic';

export async function GET() {
    const client = getClient();
    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const users = await client.getUsersDetails();
        return NextResponse.json({ users });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
