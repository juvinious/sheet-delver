
import { handleImport } from './api/import';
import { handleGetLevelUpData, handleRollHP, handleRollGold, handleFinalizeLevelUp } from "./api/level-up";
import { handleLearnSpell, handleGetSpellsBySource } from './api/spells';
import { dataManager } from './data/DataManager';

// Initialize data cache
dataManager.initialize();

export const apiRoutes = {
    'import': handleImport,
    'actors/[id]/level-up/data': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1]; // Extract [id] from route array
        return handleGetLevelUpData(actorId, request);
    },
    'actors/level-up/data': async (request: Request) => {
        return handleGetLevelUpData(undefined, request);
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
    'spells/list': async (request: Request) => {
        return handleGetSpellsBySource(request);
    }
};
