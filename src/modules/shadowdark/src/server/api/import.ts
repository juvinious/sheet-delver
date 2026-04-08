import { ShadowdarkImporter } from '../importer';
import { logger } from '@shared/utils/logger';

export async function handleImport(request: Request) {
    try {
        const client = (request as any).foundryClient;
        if (!client || !client.isConnected) {
            return Response.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const json = await request.json();

        // Use Module Logic
        const importer = new ShadowdarkImporter();
        const result = await importer.importFromJSON(client, json);

        if (!result.success) {
            logger.error('[API] Import Failed:', result.errors);
            return Response.json({ success: false, errors: result.errors, debug: result.debug }, { status: 400 });
        }

        return Response.json({ success: true, id: result.id, errors: result.errors, debug: result.debug });

    } catch (error: any) {
        logger.error('[Shadowdark API] Import Error:', error);
        if (error.stack) logger.error(error.stack);
        return Response.json({ 
            error: error.message || 'Import failed',
            details: error.stack
        }, { status: 500 });
    }
}
