
import { handleImport } from './api/import';
import { handleGetLevelUpData, handleRollHP, handleFinalizeLevelUp } from './api/level-up';

export const apiRoutes = {
    'import': handleImport,
    'actors/[id]/level-up/data': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1]; // Extract [id] from route array
        return handleGetLevelUpData(actorId);
    },
    'actors/[id]/level-up/roll-hp': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleRollHP(actorId, request);
    },
    'actors/[id]/level-up/finalize': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        return handleFinalizeLevelUp(actorId, request);
    },
};
