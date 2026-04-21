import { shadowdarkAdapter } from '../ShadowdarkAdapter';
import { getErrorMessage } from '@server/shared/utils/getErrorMessage';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';
import { logger } from '@shared/utils/logger';

/**
 * GET /api/modules/shadowdark/roll-table
 * List all roll tables
 */
export async function handleListRollTables() {
    try {
        const index = await shadowdarkAdapter.getRegistryIndex();
        const tables = Object.entries(index)
            .filter(([uuid, _name]) => uuid.includes('.rollable-tables.') && !uuid.includes('.TableResult.'))
            .map(([uuid, name]) => ({ uuid, name }));

        return Response.json({ success: true, tables });
    } catch (error: unknown) {
        logger.error('[Shadowdark API] List tables failed:', error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

/**
 * GET /api/roll-table/[id]
 * Get specific table
 */
export async function handleGetRollTable(_request: Request, id: string, client?: RouteFoundryClient | null) {
    try {
        let table = await shadowdarkAdapter.resolveDocument(client, id);

        if (!table) {
            const index = await shadowdarkAdapter.getRegistryIndex();
            const uuid = Object.keys(index).find(k => k.endsWith(`.${id}`));
            if (uuid) table = await shadowdarkAdapter.resolveDocument(client, uuid);
        }

        if (!table) {
            return Response.json({ error: `Table not found: ${id}` }, { status: 404 });
        }

        return Response.json({ success: true, table });
    } catch (error: unknown) {
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

/**
 * POST /api/roll-table/[id]/draw
 * Execute a draw
 */
export async function handleDrawRollTable(_request: Request, id: string, client?: RouteFoundryClient | null) {
    try {
        const result = await shadowdarkAdapter.drawTable(id, client);

        if (!result) {
            return Response.json({ error: `Draw failed for table: ${id}` }, { status: 404 });
        }

        return Response.json({
            success: true,
            ...result
        });
    } catch (error: unknown) {
        logger.error(`[Shadowdark API] Draw failed for ${id}:`, error);
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

/**
 * POST /api/roll-table/[id]/draw/[resultId]
 * Fetch a specific result pool for that range
 */
export async function handleGetResultPool(_request: Request, tableId: string, resultId: string, client?: RouteFoundryClient | null) {
    try {
        const table = await shadowdarkAdapter.resolveDocument(client, tableId);
        if (!table) return Response.json({ error: `Table not found: ${tableId}` }, { status: 404 });

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
            roll: range[0], 
            results: pool
        });
    } catch (error: unknown) {
        return Response.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
