import type { Server as SocketIOServer } from 'socket.io';
import type { SessionManager } from '@core/session/SessionManager';
import type { AppConfig } from '@shared/interfaces';
import { createStatusService } from '@server/services/status/StatusService';
import { createSystemStatusBroadcaster } from '@server/realtime/SystemStatusBroadcaster';
import { registerAppSocketGateway } from '@server/realtime/AppSocketGateway';

interface RegisterSocketsDeps {
    io: SocketIOServer;
    sessionManager: SessionManager;
    config: AppConfig;
}

export function registerSockets(deps: RegisterSocketsDeps) {
    // Status read model feeds both REST status responses and socket broadcasts.
    const statusService = createStatusService({
        config: deps.config,
        sessionManager: deps.sessionManager
    });
    const { getSystemStatusPayload } = statusService;

    // Broadcaster centralizes event-driven and interval-based status emissions.
    const systemStatusBroadcaster = createSystemStatusBroadcaster({
        io: deps.io,
        getSystemStatusPayload
    });
    const { broadcastSystemStatus } = systemStatusBroadcaster;

    systemStatusBroadcaster.registerLifecycleBroadcasts();
    registerAppSocketGateway({
        io: deps.io,
        sessionManager: deps.sessionManager,
        getSystemStatusPayload,
        broadcastSystemStatus
    });

    // Preserve existing polling cadence used by status UI updates.
    systemStatusBroadcaster.startPolling(4000);

    return {
        getSystemStatusPayload,
        broadcastSystemStatus
    };
}
