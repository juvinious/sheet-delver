import { shadowdarkAdapter } from '../../server/ShadowdarkAdapter';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import { getModuleFoundryClient } from '@server/shared/utils/getModuleFoundryClient';
import { logger } from '@shared/utils/logger';

export async function handleGetDocument(request: Request, { params }: any) {
    try {
        const { route } = await params;
        const uuid = route.slice(1).join('/');

        if (!uuid) {
            return Response.json({ error: 'Missing UUID' }, { status: 400 });
        }

        const client = getModuleFoundryClient(request);
        const document = await shadowdarkAdapter.resolveDocument(client, uuid);

        if (!document) {
            return Response.json({ error: `Document not found: ${uuid}` }, { status: 404 });
        }

        return Response.json(document);
    } catch (error: unknown) {
        logger.error('Failed to get Shadowdark document', error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
