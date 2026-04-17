type GetOrRestoreSession = (token: string) => Promise<any>;

interface DebugServiceDeps {
    getSystemClient: () => any;
    getOrRestoreSession: GetOrRestoreSession;
}

export function createDebugService(deps: DebugServiceDeps) {
    // Debug actor lookup prefers the caller session when available for user-accurate data.
    const getActor = async (actorId: string, authorization?: string) => {
        let client = deps.getSystemClient();

        if (authorization && authorization.startsWith('Bearer ')) {
            const token = authorization.split(' ')[1];
            const session = await deps.getOrRestoreSession(token);
            if (session) client = session.client as any;
        }

        return client.getActor(actorId);
    };

    return {
        getActor
    };
}
