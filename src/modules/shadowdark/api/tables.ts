import { dataManager } from '../data/DataManager';

export async function handleRollTable(request: Request) {
    try {
        const { tableUuid } = await request.json();

        if (!tableUuid) {
            return Response.json({ error: 'Missing tableUuid' }, { status: 400 });
        }

        const result = await dataManager.rollTable(tableUuid);

        if (!result) {
            return Response.json({ error: `Table not found or invalid: ${tableUuid}` }, { status: 404 });
        }

        return Response.json({
            success: true,
            ...result
        });
    } catch (e: any) {
        console.error('Failed to roll Shadowdark table', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
