/**
 * Mörk Borg Module - Server Routes
 * API endpoints for the Mörk Borg system module
 */

import { handleIndex } from './api/index';
import { handleGetActorData } from './api/actor-data';
import { handleGetItems, handleDeleteItem } from './api/items';
import { handleUpdateActor } from './api/update';
import { handleBrewDecoctions } from './api/brew-decoctions';
import { logger } from '../../core/logger';
import { getConfig } from '../../core/config';

export const apiRoutes = {
    'index': handleIndex,

    'actors/[id]': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        return handleGetActorData(actorId, client);
    },

    'actors/[id]/data': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        return handleGetActorData(actorId, client);
    },

    'actors/[id]/items': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        return handleGetItems(actorId, client);
    },

    'actors/[id]/update': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        return handleUpdateActor(actorId, request, client);
    },

    'actors/[id]/items/[itemId]': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const itemId = route[3];
        const client = (request as any).foundryClient;

        if (request.method === 'DELETE') {
            return handleDeleteItem(actorId, itemId, client);
        }

        return Response.json({ error: 'Method not allowed' }, { status: 405 });
    },

    'actors/[id]/brew-decoctions': async (request: Request, { params }: any) => {
        const { route } = await params;
        const actorId = route[1];
        const client = (request as any).foundryClient;
        return handleBrewDecoctions(actorId, request, client);
    }
};

logger.info(`[DEBUG] morkborg/server.ts loaded. keys: ${Object.keys(apiRoutes || {}).join(', ')}`);
