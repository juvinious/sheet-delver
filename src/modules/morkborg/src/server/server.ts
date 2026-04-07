/**
 * Mörk Borg Module - Server Routes
 * API endpoints for the Mörk Borg system module
 */

import { handleIndex } from './index';
import { handleGetActorData } from './actor-data';
import { handleGetItems, handleDeleteItem } from './items';
import { handleUpdateActor } from './update';
import { handleBrewDecoctions } from './brew-decoctions';
import { logger } from '@/core/logger';
import { getConfig } from '@/core/config';

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
