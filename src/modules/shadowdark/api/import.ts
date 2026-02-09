
import { NextResponse } from 'next/server';
import { getClient } from '@/core/foundry/instance';
import { ShadowdarkImporter } from '../importer';

export async function handleImport(request: Request) {
    try {
        const client = (request as any).foundryClient;
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const json = await request.json();

        // Use Module Logic
        const importer = new ShadowdarkImporter();
        const result = await importer.importFromJSON(client, json);

        if (!result.success) {
            console.error('[API] Import Failed:', result.errors);
            return NextResponse.json({ success: false, errors: result.errors, debug: result.debug }, { status: 400 });
        }

        return NextResponse.json({ success: true, id: result.id, errors: result.errors, debug: result.debug });

    } catch (error: any) {
        console.error('[API] Import Error:', error);
        return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
    }
}
