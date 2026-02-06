
import { handleImport } from './api/import';
import { handleGetLevelUpData, handleRollHP, handleRollGold, handleFinalizeLevelUp } from "./api/level-up";
import { handleLearnSpell, handleGetSpellsBySource, handleGetSpellcasterInfo } from './api/spells';
import { handleIndex } from './api/index';
import { dataManager } from './data/DataManager';

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
    'actors/[id]/predefined-effects': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];

        if (request.method === 'POST') {
            const { effectKey } = await request.json();
            const client = (request as any).foundryClient;
            if (!client) return Response.json({ error: 'No client' }, { status: 500 });

            const success = await client.toggleStatusEffect(actorId, effectKey);
            return Response.json({ success });
        }

        const { PREDEFINED_EFFECTS } = await import('./data/effects');
        return Response.json(PREDEFINED_EFFECTS);
    },
    'spells/list': async (request: Request) => {
        return handleGetSpellsBySource(request);
    }
};
