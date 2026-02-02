import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const client = getClient();
        if (!client || !client.isLoggedIn) {
            return NextResponse.json(
                { error: 'Not logged in' },
                { status: 401 }
            );
        }

        const body = await request.json();

        const result = await client.updateActor(id, body);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
