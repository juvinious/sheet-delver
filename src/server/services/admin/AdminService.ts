import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';
import { SetupManager } from '@core/foundry/SetupManager';

interface AdminServiceDeps {
    getSystemStatusPayload: () => Promise<any>;
}

export function createAdminService(deps: AdminServiceDeps) {
    // Admin status projection used by CLI and local maintenance surfaces.
    const getStatus = async () => {
        const systemStatus = await deps.getSystemStatusPayload();
        const client = systemService.getSystemClient();
        return {
            ...systemStatus,
            socket: client.isConnected,
            worldState: (client as any).worldState,
            userId: client.userId,
            isExplicit: (client as any).isExplicitSession,
            discoveredUserId: (client as any).discoveredUserId
        };
    };

    // World listing flow with scrape-first and cache fallback behavior.
    const listWorlds = async () => {
        const client = systemService.getSystemClient();
        let worlds: any[] = [];

        worlds = await SetupManager.scrapeAvailableWorlds(client.url || '');

        if (worlds.length === 0) {
            const cache = await SetupManager.loadCache();
            if (cache.currentWorldId && cache.worlds[cache.currentWorldId]) {
                worlds = [cache.worlds[cache.currentWorldId]];
            }
        }

        return worlds;
    };

    const getCache = async () => {
        return SetupManager.loadCache();
    };

    // Manual setup scrape used by local admin/CLI workflows.
    const scrapeSetup = async (sessionCookie: string) => {
        if (!sessionCookie) return { error: 'Session cookie required', status: 400 };

        const client = systemService.getSystemClient();
        logger.info('Core Service | Triggering manual deep-scrape via CLI...');

        const result = await SetupManager.scrapeWorldData(client.url || '', sessionCookie);
        await SetupManager.saveCache(result);

        return { success: true, data: result };
    };

    const launchWorld = async (worldId: string) => {
        const client = systemService.getSystemClient();
        await client.launchWorld(worldId);
        return { success: true, message: `Request to launch world ${worldId} sent.` };
    };

    const shutdownWorld = async () => {
        const client = systemService.getSystemClient();
        await client.shutdownWorld();
        return { success: true, message: 'Request to shut down current world sent.' };
    };

    return {
        getStatus,
        listWorlds,
        getCache,
        scrapeSetup,
        launchWorld,
        shutdownWorld
    };
}
