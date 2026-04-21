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

    const lifecycleRegistration = systemStatusBroadcaster.registerLifecycleBroadcasts();
    registerAppSocketGateway({
        io: deps.io,
        sessionManager: deps.sessionManager,
        getSystemStatusPayload,
        broadcastSystemStatus
    });

    // Preserve existing polling cadence used by status UI updates.
    const pollingInterval = systemStatusBroadcaster.startPolling(4000);

    let isCleanedUp = false;
    let isForwardingSignal = false;
    const cleanup = () => {
        if (isCleanedUp) {
            return;
        }

        isCleanedUp = true;
        clearInterval(pollingInterval);
        lifecycleRegistration.dispose();
        process.off('SIGTERM', handleSigterm);
        process.off('SIGINT', handleSigint);
    };

    const forwardSignal = (signal: NodeJS.Signals) => {
        cleanup();
        if (isForwardingSignal) {
            return;
        }

        isForwardingSignal = true;
        setImmediate(() => {
            process.kill(process.pid, signal);
        });
    };

    const handleSigterm = () => {
        forwardSignal('SIGTERM');
    };

    const handleSigint = () => {
        forwardSignal('SIGINT');
    };

    process.on('SIGTERM', handleSigterm);
    process.on('SIGINT', handleSigint);

    return {
        getSystemStatusPayload,
        broadcastSystemStatus,
        cleanup
    };
}
