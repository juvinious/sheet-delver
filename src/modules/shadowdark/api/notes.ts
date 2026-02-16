import { FoundryClient } from '@/core/foundry/interfaces';
import { logger } from '@/core/logger';

/**
 * Handle GET request for actor notes
 */
export async function handleGetNotes(actorId: string, client: FoundryClient) {
    try {
        // Fetch actor using getActor (normalized) or getActorRaw
        const actor = await (client.getActorRaw ? client.getActorRaw(actorId) : client.getActor(actorId));

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
export async function handleUpdateNotes(actorId: string, request: Request, client: FoundryClient) {
    try {
        // Parse request body
        const body = await request.json();
        const { notes } = body;

        if (typeof notes !== 'string') {
            throw new Error('Invalid notes data: must be a string');
        }

        // Fetch actor to verify it exists
        const actor = await (client.getActorRaw ? client.getActorRaw(actorId) : client.getActor(actorId));

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
