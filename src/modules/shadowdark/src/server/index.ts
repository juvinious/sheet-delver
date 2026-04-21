

import { handleImport } from './api/import';
import type { ModuleRouteParams } from '@server/shared/types/moduleProxy';
import { getModuleFoundryClient, getModuleUserSession } from '@server/shared/utils/getModuleFoundryClient';
import { handleGetLevelUpData, handleRollHP, handleRollGold, handleFinalizeLevelUp, handleRollTalent, handleRollBoon, handleResolveChoice } from "./api/level-up";
import { handleLearnSpell, handleGetSpellsBySource, handleGetSpellcasterInfo } from './api/spells';
import { handleGetDocument } from './api/document';
import { handleEffects } from './api/effects';
import { handleGetGear } from './api/gear';
import { handleGetCollection } from './api/collections';
import { handleIndex } from './api/index';
import { handleGetCustomMaps } from './api/custom-maps';
import { handleListRollTables, handleGetRollTable, handleDrawRollTable, handleGetResultPool } from './api/tables';
import { handleGetNotes, handleUpdateNotes } from './api/notes';
import { getConfig } from '@core/config';
import { logger } from '@shared/utils/logger';
import {
    handleRandomizeCharacter,
    handleRandomizeName,
    handleRandomizeAncestry,
    handleRandomizeClass,
    handleRandomizeBackground,
    handleRandomizeAlignment,
    handleRandomizeDeity,
    handleRandomizePatron,
    handleRandomizeStats,
    handleRandomizeGear,
    handleRandomizeTalents,
    handleRandomizeLanguages
} from './api/randomize-character';
import { shadowdarkAdapter } from './ShadowdarkAdapter';

// Initialize system adapter
shadowdarkAdapter.initialize();

function getAuthenticatedModuleClient(request: Request) {
    const client = getModuleFoundryClient(request);
    if (!client) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return client;
}


export const apiRoutes = {
    'index': handleIndex,
    'custom-maps': handleGetCustomMaps,
    'import': handleImport,
    'gear/list': handleGetGear,
    // Available fetch-pack IDs:
    // ancestries, backgrounds, classes, deities, patrons, spells, 
    // talents, languages, gear, magic-items, conditions, spell-effects
    'fetch-pack/[id]': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const packId = route[1];
        const client = getModuleFoundryClient(request);
        return handleGetCollection(request, packId, client);
    },
    'document/[uuid]': handleGetDocument,
    'actors/randomize': handleRandomizeCharacter,
    'actors/randomize/name': handleRandomizeName,
    'actors/randomize/ancestry': handleRandomizeAncestry,
    'actors/randomize/class': handleRandomizeClass,
    'actors/randomize/background': handleRandomizeBackground,
    'actors/randomize/alignment': handleRandomizeAlignment,
    'actors/randomize/deity': handleRandomizeDeity,
    'actors/randomize/patron': handleRandomizePatron,
    'actors/randomize/stats': handleRandomizeStats,
    'actors/randomize/gear': handleRandomizeGear,
    'actors/randomize/talents': handleRandomizeTalents,
    'actors/randomize/languages': handleRandomizeLanguages,
    'actors/level-up/data': async (request: Request) => {
        return handleGetLevelUpData(undefined, request, getModuleFoundryClient(request));
    },
    'actors/[id]/level-up/data': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1]; // Extract [id] from route array
        return handleGetLevelUpData(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/effects': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;
        const result = await handleEffects(actorId, client, 'list');
        return Response.json(result);
    },
    'actors/[id]/effects/create': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;
        const data = await request.json();
        const result = await handleEffects(actorId, client, 'create', data);
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/update': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;
        const data = await request.json();
        const result = await handleEffects(actorId, client, 'update', data);
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/delete': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;
        const url = new URL(request.url, getConfig().app.url);
        const effectId = url.searchParams.get('effectId');
        if (!effectId) return Response.json({ error: 'Missing effectId' }, { status: 400 });
        const result = await handleEffects(actorId, client, 'delete', { effectId });
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/toggle': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;
        const { effectId } = await request.json();
        const result = await handleEffects(actorId, client, 'toggle', { effectId });
        return Response.json({ success: true, result });
    },
    'actors/[id]/notes': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        const client = getAuthenticatedModuleClient(request);
        if (client instanceof Response) return client;

        if (request.method === 'GET') {
            const result = await handleGetNotes(actorId, client);
            return Response.json(result);
        } else if (request.method === 'POST') {
            const result = await handleUpdateNotes(actorId, request, client);
            return Response.json(result);
        }

        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    },
    'actors/[id]/level-up/roll-hp': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollHP(actorId, request, getModuleFoundryClient(request), getModuleUserSession(request));
    },
    'actors/[id]/level-up/roll-gold': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollGold(actorId, request, getModuleFoundryClient(request), getModuleUserSession(request));
    },
    'actors/[id]/level-up/finalize': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleFinalizeLevelUp(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/level-up/roll-talent': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollTalent(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/level-up/roll-boon': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollBoon(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/level-up/resolve-choice': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleResolveChoice(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/spells/learn': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleLearnSpell(actorId, request, getModuleFoundryClient(request));
    },
    'actors/[id]/spellcaster': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const actorId = route[1];
        return handleGetSpellcasterInfo(actorId, getModuleFoundryClient(request));
    },
    'effects/predefined-effects': async (request: Request) => {
        const client = getModuleFoundryClient(request);
        if (!client) return Response.json({ error: 'Not authenticated' }, { status: 401 });

        const systemData = await shadowdarkAdapter.getSystemData(client, { minimal: true });

        const effects = Object.entries(systemData.PREDEFINED_EFFECTS || {}).map(([id, effect]: [string, any]) => ({
            id,
            ...effect
        }));

        return Response.json(effects);
    },
    'spells/list': async (request: Request) => {
        return handleGetSpellsBySource(request);
    },
    'roll-table': async (request: Request) => {
        return handleListRollTables();
    },
    'roll-table/[id]': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const id = route[1];
        return handleGetRollTable(request, id, getModuleFoundryClient(request));
    },
    'roll-table/[id]/draw': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const id = route[1];
        return handleDrawRollTable(request, id, getModuleFoundryClient(request));
    },
    'roll-table/[tableId]/draw/[resultId]': async (request: Request, { params }: ModuleRouteParams) => {
        const { route } = await params;
        const tableId = route[1];
        const resultId = route[3];
        return handleGetResultPool(request, tableId, resultId, getModuleFoundryClient(request));
    }
};



