import { dataManager } from '../../data/DataManager';
import { logger } from '@shared/utils/logger';

export async function handleGetDocument(request: Request, { params }: any) {
    try {
        const { route } = await params;
        const uuid = route.slice(1).join('/');

        if (!uuid) {
            return Response.json({ error: 'Missing UUID' }, { status: 400 });
        }

        const { shadowdarkAdapter } = await import('../../server/ShadowdarkAdapter');
        const client = (request as any).foundryClient;
        const document = await shadowdarkAdapter.resolveDocument(client, uuid);

        if (!document) {
            return Response.json({ error: `Document not found: ${uuid}` }, { status: 404 });
        }

        return Response.json(document);
    } catch (e: any) {
        logger.error('Failed to get Shadowdark document', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
