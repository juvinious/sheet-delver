

import { handleImport } from './api/import';
import { handleGetLevelUpData, handleRollHP, handleRollGold, handleFinalizeLevelUp, handleRollTalent, handleRollBoon, handleResolveChoice } from "./api/level-up";
import { handleLearnSpell, handleGetSpellsBySource, handleGetSpellcasterInfo } from './api/spells';
import { handleGetDocument } from './api/document';
import { handleEffects } from './api/effects';
import { handleGetGear } from './api/gear';
import { handleIndex } from './api/index';
import { handleListRollTables, handleGetRollTable, handleDrawRollTable, handleGetResultPool } from './api/tables';
import { handleGetNotes, handleUpdateNotes } from './api/notes';
import { dataManager } from './data/DataManager';
import { getConfig } from '../../core/config';
import { logger } from '../../core/logger';
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
import { ShadowdarkAdapter } from './system';

// Initialize data cache
dataManager.initialize();

export const apiRoutes = {
    'index': handleIndex,
    'import': handleImport,
    'gear/list': handleGetGear,
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
        return handleGetLevelUpData(undefined, request, (request as any).foundryClient);
    },
    'actors/[id]/level-up/data': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1]; // Extract [id] from route array
        return handleGetLevelUpData(actorId, request, (request as any).foundryClient);
    },
    'actors/[id]/effects': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        const result = await handleEffects(actorId, client, 'list');
        return Response.json(result);
    },
    'actors/[id]/effects/create': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        const data = await request.json();
        const result = await handleEffects(actorId, client, 'create', data);
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/update': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        const data = await request.json();
        const result = await handleEffects(actorId, client, 'update', data);
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/delete': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        const url = new URL(request.url, getConfig().app.url);
        const effectId = url.searchParams.get('effectId');
        if (!effectId) return Response.json({ error: 'Missing effectId' }, { status: 400 });
        const result = await handleEffects(actorId, client, 'delete', { effectId });
        return Response.json({ success: true, result });
    },
    'actors/[id]/effects/toggle': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        const { effectId } = await request.json();
        const result = await handleEffects(actorId, client, 'toggle', { effectId });
        return Response.json({ success: true, result });
    },
    'actors/[id]/notes': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;

        if (request.method === 'GET') {
            const result = await handleGetNotes(actorId, client);
            return Response.json(result);
        } else if (request.method === 'POST') {
            const result = await handleUpdateNotes(actorId, request, client);
            return Response.json(result);
        }

        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    },
    'actors/level-up/roll-hp': async (request: Request) => {
        return handleRollHP(undefined, request, (request as any).foundryClient, (request as any).userSession);
    },
    // /api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-hp
    'actors/[id]/level-up/roll-hp': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollHP(actorId, request, (request as any).foundryClient, (request as any).userSession);
    },
    'actors/level-up/roll-gold': async (request: Request) => {
        return handleRollGold(undefined, request, (request as any).foundryClient, (request as any).userSession);
    },
    'actors/[id]/level-up/roll-gold': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollGold(actorId, request, (request as any).foundryClient, (request as any).userSession);
    },
    'actors/[id]/level-up/finalize': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleFinalizeLevelUp(actorId, request, (request as any).foundryClient);
    },
    'actors/level-up/roll-talent': async (request: Request) => {
        return handleRollTalent(undefined, request, (request as any).foundryClient);
    },
    'actors/[id]/level-up/roll-talent': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollTalent(actorId, request, (request as any).foundryClient);
    },
    'actors/level-up/roll-boon': async (request: Request) => {
        return handleRollBoon(undefined, request, (request as any).foundryClient);
    },
    'actors/[id]/level-up/roll-boon': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollBoon(actorId, request, (request as any).foundryClient);
    },
    'actors/level-up/resolve-choice': async (request: Request) => {
        return handleResolveChoice(undefined, request, (request as any).foundryClient);
    },
    'actors/[id]/level-up/resolve-choice': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleResolveChoice(actorId, request, (request as any).foundryClient);
    },
    'actors/[id]/spells/learn': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleLearnSpell(actorId, request, (request as any).foundryClient);
    },
    'actors/[id]/spellcaster': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleGetSpellcasterInfo(actorId, (request as any).foundryClient);
    },
    'effects/predefined-effects': async (request: Request) => {
        const client = (request as any).foundryClient;
        if (!client) return Response.json({ error: 'Not authenticated' }, { status: 401 });

        const shadowDarkAdapter = new ShadowdarkAdapter();
        const systemData = await shadowDarkAdapter.getSystemData(client, { minimal: true });

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
    'roll-table/[id]': async (request: Request, { params }: any) => {
        const { route } = await params;
        const id = route[1];
        return handleGetRollTable(request, id);
    },
    'roll-table/[id]/draw': async (request: Request, { params }: any) => {
        const { route } = await params;
        const id = route[1];
        return handleDrawRollTable(request, id);
    },
    'roll-table/[tableId]/draw/[resultId]': async (request: Request, { params }: any) => {
        const { route } = await params;
        const tableId = route[1];
        const resultId = route[3];
        return handleGetResultPool(request, tableId, resultId);
    }
};

logger.info(`[DEBUG] shadowdark/server.ts loaded. keys: ${Object.keys(apiRoutes || {}).join(', ')}`);

