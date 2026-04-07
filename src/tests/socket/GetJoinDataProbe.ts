// GetJoinData Probe
// Test if we can connect as guest and fetch join data
// Usage: npx tsx src/test/socket/GetJoinDataProbe.ts

import { io } from 'socket.io-client';

import { loadConfig } from '../../core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probe() {
    logger.info('[PROBE] Connecting to socket as guest...');

    const socket = io(BASE_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        // No session - connecting as guest
    });

    socket.on('connect', () => {
        logger.info('[PROBE] Socket connected!');
        logger.info('[PROBE] Emitting getJoinData...');

        socket.emit('getJoinData', (data: any) => {
            logger.info('[PROBE] Received response:');
            logger.info(JSON.stringify(data, null, 2));

            if (data.users) {
                logger.info(`\n[PROBE] Found ${data.users.length} users:`);
                data.users.forEach((u: any) => {
                    logger.info(`  - ${u.name} (ID: ${u._id})`);
                });
            }

            socket.disconnect();
            process.exit(0);
        });

        // Timeout
        setTimeout(() => {
            logger.info('[PROBE] Timeout - no response');
            socket.disconnect();
            process.exit(1);
        }, 5000);
    });

    socket.on('connect_error', (err) => {
        logger.error('[PROBE] Connection error:', err.message);
        process.exit(1);
    });

    socket.on('session', (data) => {
        logger.info('[PROBE] Received session event:', data);
    });
}

probe();
