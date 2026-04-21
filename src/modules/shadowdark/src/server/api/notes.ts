import type { RawActor } from '@server/shared/types/actors';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';
import { logger } from '@shared/utils/logger';

type ActorWithNotes = RawActor & {
    system?: {
        notes?: string;
        details?: {
            notes?: {
                value?: string;
            };
        };
    };
};

/**
 * Handle GET request for actor notes
 */
export async function handleGetNotes(actorId: string, client: RouteFoundryClient) {
    try {
        // Fetch actor using getActor (normalized) or getActorRaw
        const actor = await (client.getActorRaw ? client.getActorRaw(actorId) : client.getActor(actorId)) as ActorWithNotes | null | undefined;

        if (!actor) {
            throw new Error('Actor not found');
        }

        // Return notes from the appropriate path
        const notes = actor.system?.notes || actor.system?.details?.notes?.value || '';

        return {
            notes
        };
    } catch (error) {
        logger.error('Error fetching actor notes:', error);
        throw error;
    }
}

/**
 * Handle POST request to update actor notes
 */
export async function handleUpdateNotes(actorId: string, request: Request, client: RouteFoundryClient) {
    try {
        // Parse request body
        const body = await request.json();
        const { notes } = body;

        if (typeof notes !== 'string') {
            throw new Error('Invalid notes data: must be a string');
        }

        // Fetch actor to verify it exists
        const actor = await (client.getActorRaw ? client.getActorRaw(actorId) : client.getActor(actorId)) as ActorWithNotes | null | undefined;

        if (!actor) {
            throw new Error('Actor not found');
        }

        // Update actor notes using system.notes path (PC-only)
        await client.dispatchDocument('Actor', 'update', {
            updates: [{
                _id: actorId,
                'system.notes': notes
            }]
        });

        logger.info(`Updated notes for actor ${actorId}`);

        return {
            success: true
        };
    } catch (error) {
        logger.error('Error updating actor notes:', error);
        throw error;
    }
}
