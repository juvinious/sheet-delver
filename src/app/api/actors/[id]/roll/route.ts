import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { getAdapter } from '@/modules/core/registry';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const client = getClient();

    if (!client || !client.isLoggedIn) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { type, key, options } = body; // e.g., type='ability', key='str', options={...}


        // 1. Get Actor System Data to calc formula
        const rawActor = await client.getActor(id);
        if (!rawActor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });

        // 2. Get Adapter
        const systemInfo = await client.getSystem();
        const adapter = getAdapter(systemInfo.id);

        if (!adapter) {
            return NextResponse.json({ error: `System adapter '${systemInfo.id}' not found` }, { status: 400 });
        }

        // 3. Get generic roll data
        let rollData;
        if (type === 'formula') {
            // Raw formula roll
            rollData = {
                formula: key, // In this case, 'key' holds the formula string
                type: 'formula',
                label: 'Custom Roll'
            };
        } else {
            // System-specific roll (ability, etc.)
            rollData = adapter.getRollData(rawActor, type, key, options);
        }

        if (type === 'use-item') {
            const result = await client.useItem(id, key); // key is itemId
            // Flatten result ({ success, method, html, result }) into the top-level response
            return NextResponse.json({ ...(result as any), success: true });
        }

        if (!rollData) {
            return NextResponse.json({ success: false, error: 'Cannot determine roll formula' }, { status: 400 });
        }

        // 4. Exec Roll via Client
        const result = await client.roll(rollData.formula, rollData.label);

        return NextResponse.json({ success: true, result, label: rollData.label });

    } catch (error: any) {
        console.error('[API] Roll Error:', error);
        return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
}
