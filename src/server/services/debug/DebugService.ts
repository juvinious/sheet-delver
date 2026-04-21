import type { ActorServiceClientLike } from '@server/shared/types/actors';
import type { UserSessionLike } from '@server/shared/types/foundry';

type DebugSession = UserSessionLike & {
    client: ActorServiceClientLike;
};

type GetOrRestoreSession = (token: string) => Promise<DebugSession | undefined>;

interface DebugServiceDeps {
    getOrRestoreSession: GetOrRestoreSession;
}

export function createDebugService(deps: DebugServiceDeps) {
    // Debug actor lookup requires a valid user session; no system client fallback is allowed.
    const getActor = async (actorId: string, authorization: string) => {
        if (!authorization.startsWith('Bearer ')) {
            const err = new Error('Unauthorized: Missing Session Token') as Error & { status?: number };
            err.status = 401;
            throw err;
        }

        const token = authorization.split(' ')[1];
        const session = await deps.getOrRestoreSession(token);
        if (!session || !session.client?.userId) {
            const err = new Error('Unauthorized: Invalid or Expired Session') as Error & { status?: number };
            err.status = 401;
            throw err;
        }

        return session.client.getActor(actorId);
    };

    return {
        getActor
    };
}
