import { dataManager } from '../data/DataManager';

export async function handleGetDocument(request: Request, { params }: any) {
    try {
        const { route } = await params;
        const uuid = route.slice(1).join('/');

        if (!uuid) {
            return Response.json({ error: 'Missing UUID' }, { status: 400 });
        }

        let document = await dataManager.getDocument(uuid);

        if (!document) {
            const client = (request as any).foundryClient;
            if (client && client.isConnected) {
                document = await client.fetchByUuid(uuid);
            }
        }

        if (!document) {
            return Response.json({ error: `Document not found: ${uuid}` }, { status: 404 });
        }

        return Response.json(document);
    } catch (e: any) {
        console.error('Failed to get Shadowdark document', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
