import { getAdapter } from '@modules/registry/server';
import { systemService } from '@core/system/SystemService';
import { SetupManager } from '@core/foundry/SetupManager';
import { UserRole } from '@shared/constants';

interface StatusServiceDeps {
    config: any;
    sessionManager: {
        isCacheReady: () => boolean;
    };
}

export function createStatusService(deps: StatusServiceDeps) {
    // Shared user projection used by status payload consumers.
    const sanitizeUser = (user: any, client: any) => ({
        _id: user._id || user.id,
        name: user.name,
        role: user.role,
        isGM: user.role >= UserRole.ASSISTANT,
        active: user.active,
        color: user.color,
        characterId: user.character,
        img: client.resolveUrl(user.avatar || user.img)
    });

    // Builds the status contract consumed by REST status and socket broadcasts.
    const getSystemStatusPayload = async () => {
        const systemClient = systemService.getSystemClient();
        let system: any = {
            id: null,
            status: systemClient.worldState,
            worldTitle: 'Reconnecting...'
        };
        let users = [];

        try {
            const gameData = systemClient.getGameData();
            if (gameData) {
                const usersList = gameData.users || [];
                const activeCount = usersList.filter((u: any) => u.active).length;
                const totalCount = usersList.length;

                system = {
                    ...gameData.system,
                    appVersion: deps.config.app.version,
                    worldTitle: gameData.world?.title || 'Foundry VTT',
                    worldDescription: gameData.world?.description,
                    worldBackground: systemClient.resolveUrl(gameData.world?.background),
                    background: systemClient.resolveUrl(
                        gameData.system?.background ||
                        gameData.system?.worldBackground ||
                        (() => {
                            const sceneData = (systemClient as any).sceneDataCache;
                            return sceneData?.NUEDEFAULTSCENE0?.background?.src;
                        })()
                    ),
                    nextSession: gameData.world?.nextSession,
                    status: systemClient.worldState === 'active' ? 'active' : systemClient.worldState,
                    actorSyncToken: (systemClient as any).lastActorChange,
                    users: { active: activeCount, total: totalCount }
                };
                users = usersList;
            } else {
                // No full game data available yet.
                // If the probe discovered the world (service account missing), surface that info.
                const probeData = (systemClient as any).probeWorldData;
                if (probeData) {
                    system.worldTitle = probeData.title || system.worldTitle;
                    system.worldDescription = probeData.description || null;
                    // Surface user count discovered by the guest probe.
                    const userMapSize = (systemClient as any).userMap?.size || 0;
                    system.users = { active: 0, total: userMapSize };
                }
                system.appVersion = deps.config.app.version;
            }

            if (system.id) {
                const sid = system.id.toLowerCase();
                const adapter = await getAdapter(sid);
                if (adapter && typeof (adapter as any).getConfig === 'function') {
                    const cfg = (adapter as any).getConfig();
                    if (cfg) system.config = cfg;
                }
            }
        } catch {
            // Suppress to preserve status endpoint behavior under partial world availability.
        }

        // Keep payload shape stable by always returning a sanitized user array.
        const sanitizedUsers = users?.length > 0 ? users.map((u: any) => sanitizeUser(u, systemClient)) : [];

        return {
            connected: systemClient.isConnected,
            worldId: systemClient.getGameData()?.world?.id || null,
            initialized: deps.sessionManager.isCacheReady(),
            isConfigured: !!(systemClient.cachedWorldData || (await SetupManager.loadCache()).currentWorldId),
            users: sanitizedUsers,
            system,
            url: deps.config.foundry.url,
            appVersion: deps.config.app.version,
            debug: deps.config.debug
        };
    };

    return {
        getSystemStatusPayload
    };
}
