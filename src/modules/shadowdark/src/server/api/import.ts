import { ShadowdarkImporter } from '../importer';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { getModuleFoundryClient } from '@server/shared/utils/getModuleFoundryClient';
import { logger } from '@shared/utils/logger';

export async function handleImport(request: Request) {
    try {
        const client = getModuleFoundryClient(request);
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

    } catch (error: unknown) {
        logger.error('[Shadowdark API] Import Error:', error);
        if (error instanceof Error && error.stack) logger.error(error.stack);
        return Response.json({ 
            error: getErrorMessage(error) || 'Import failed',
            details: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
