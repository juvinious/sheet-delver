
import { handleImport } from './api/import';
import { handleGetLevelUpData, handleRollHP, handleRollGold, handleFinalizeLevelUp } from "./api/level-up";
import { handleLearnSpell, handleGetSpellsBySource, handleGetSpellcasterInfo } from './api/spells';
import { handleEffects } from './api/effects';
import { handleIndex } from './api/index';
import { dataManager } from './data/DataManager';
import { getConfig } from '@/core/config';

// Initialize data cache
dataManager.initialize();

export const apiRoutes = {
    'index': handleIndex,
    'import': handleImport,
    'actors/[id]/level-up/data': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1]; // Extract [id] from route array
        return handleGetLevelUpData(actorId, (request as any).foundryClient || request);
    },
    'actors/level-up/data': async (request: Request) => {
        return handleGetLevelUpData(undefined, (request as any).foundryClient || request);
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
        return Response.json(result);
    },
    'actors/[id]/level-up/roll-hp': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollHP(actorId, request);
    },
    'actors/level-up/roll-hp': async (request: Request) => {
        return handleRollHP(undefined, request);
    },
    'actors/level-up/roll-gold': async (request: Request) => {
        return handleRollGold(undefined, request);
    },
    'actors/[id]/level-up/roll-gold': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollGold(actorId, request);
    },
    'actors/[id]/level-up/finalize': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleFinalizeLevelUp(actorId, request);
    },
    'actors/[id]/spells/learn': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleLearnSpell(actorId, request);
    },
    'actors/[id]/spellcaster': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleGetSpellcasterInfo(actorId, (request as any).foundryClient);
    },
    'effects/predefined-effects': async (request: Request) => {
        const client = (request as any).foundryClient;
        if (!client) return Response.json({ error: 'Not authenticated' }, { status: 401 });

        const adapter = client.getSystemAdapter ? client.getSystemAdapter() : null;
        if (!adapter) return Response.json({ error: 'Adapter not found' }, { status: 500 });

        const systemData = await adapter.getSystemData(client);
        return Response.json(systemData.PREDEFINED_EFFECTS || {});
    },
    'spells/list': async (request: Request) => {
        return handleGetSpellsBySource(request);
    }
};
