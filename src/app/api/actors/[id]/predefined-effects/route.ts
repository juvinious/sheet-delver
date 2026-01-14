import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const client = getClient();

    if (!client) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 400 });
    }

    try {
        const effectsList = await client.getPredefinedEffectsList();
        const effectsArray = effectsList ? Object.values(effectsList) : [];
        return NextResponse.json({ effects: effectsArray });
    } catch (error: any) {
        console.error('[API] Error fetching predefined effects:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch predefined effects' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const client = getClient();

    if (!client) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 400 });
    }

    try {
        const { effectKey } = await request.json();

        if (!effectKey) {
            return NextResponse.json(
                { error: 'effectKey is required' },
                { status: 400 }
            );
        }

        const result = await client.createPredefinedEffect(id, effectKey);
        return NextResponse.json({ success: true, effect: result });
    } catch (error: any) {
        console.error('[API] Error creating predefined effect:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create predefined effect' },
            { status: 500 }
        );
    }
}
