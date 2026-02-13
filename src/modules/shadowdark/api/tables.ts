import { dataManager } from '../data/DataManager';

/**
 * GET /api/roll-table
 * List all roll tables
 */
export async function handleListRollTables() {
    try {
        const index = await dataManager.getIndex();
        const tables = Object.entries(index)
            .filter(([uuid, name]) => uuid.includes('.rollable-tables.') && !uuid.includes('.TableResult.'))
            .map(([uuid, name]) => ({ uuid, name }));

        return Response.json({ success: true, tables });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}

/**
 * GET /api/roll-table/[id]
 * Get specific table
 */
export async function handleGetRollTable(request: Request, id: string) {
    try {
        // Try to find by ID in our index (which handles both UUID and short ID)
        let table = await dataManager.getDocument(id);

        if (!table) {
            // Try searching for the UUID in the index
            const index = await dataManager.getIndex();
            const uuid = Object.keys(index).find(k => k.endsWith(`.${id}`));
            if (uuid) table = await dataManager.getDocument(uuid);
        }

        if (!table) {
            return Response.json({ error: `Table not found: ${id}` }, { status: 404 });
        }

        return Response.json({ success: true, table });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/roll-table/[id]/draw
 * Execute a draw
 */
export async function handleDrawRollTable(request: Request, id: string) {
    try {
        const result = await dataManager.draw(id);

        if (!result) {
            return Response.json({ error: `Draw failed for table: ${id}` }, { status: 404 });
        }

        return Response.json({
            success: true,
            ...result
        });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/roll-table/[id]/draw/[resultId]
 * Fetch a specific result pool for that range
 */
export async function handleGetResultPool(request: Request, tableId: string, resultId: string) {
    try {
        const table = await dataManager.getDocument(tableId);
        if (!table) return Response.json({ error: `Table not found: ${tableId}` }, { status: 404 });

        // User wants the result pool from that range. 
        // We can use the resultId to find the range, then return all results in that range.
        const targetResult = table.results?.find((r: any) => r._id === resultId || r.id === resultId);
        if (!targetResult) return Response.json({ error: `Result not found: ${resultId}` }, { status: 404 });

        const range = targetResult.range || [1, 1];
        const pool = table.results.filter((r: any) => {
            const rRange = r.range || [1, 1];
            return range[0] === rRange[0] && range[1] === rRange[1];
        });

        return Response.json({
            success: true,
            id: tableId,
            roll: range[0], // Represent as if we rolled this range
            results: pool
        });
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
