
// Socket Probe Script
// Location: src/test/socket/SocketProbe.ts
// Usage: npx tsx src/test/socket/SocketProbe.ts

import { io } from 'socket.io-client';
// Polyfill fetch
const fetch = global.fetch;

import { loadConfig } from '@core/config';
import { logger } from '@shared/utils/logger';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probeSocket() {
    logger.info(`[PROBE] Fetching ${BASE_URL}/join for guest cookie...`);
    const res = await fetch(`${BASE_URL}/join`);
    const setCookie = res.headers.get('set-cookie');

    if (!setCookie) {
        logger.error("No cookie received!");
        return;
    }

    const sessionCookie = setCookie.split(';')[0];
    logger.info(`[PROBE] Got Cookie: ${sessionCookie}`);

    // Parse Session ID for socket query (usually needed)
    // session=xxxx
    const sessionId = sessionCookie.split('=')[1];

    logger.info(`[PROBE] Connecting to socket...`);
    const socket = io(`${BASE_URL}`, {
        path: '/socket.io',
        query: { session: sessionId },
        extraHeaders: {
            Cookie: sessionCookie
        },
        transports: ['websocket']
    });

    socket.on('connect', () => {
        logger.info(`[PROBE] Socket Connected! ID: ${socket.id}`);

        // Try to fetch users immediately
        logger.info(`[PROBE] Emitting 'modifyDocument' for User get...`);
        socket.emit('modifyDocument', {
            type: 'User',
            action: 'get',
            operation: { action: 'get', broadcast: false }
        }, (response: any) => {
            logger.info(`[PROBE] Received Response!`);
            // logger.info(JSON.stringify(response, null, 2));

            if (response && response.result) {
                logger.info(`[PROBE] Found ${response.result.length} users.`);
                response.result.forEach((u: any) => {
                    logger.info(` - User: ${u.name} (ID: ${u._id})`);
                });
            } else {
                logger.info(`[PROBE] Response empty or denied.`);
            }

            socket.disconnect();
            process.exit(0);
        });

        // Set a timeout
        setTimeout(() => {
            logger.info("[PROBE] Timeout waiting for response.");
            socket.disconnect();
            process.exit(1);
        }, 5000);
    });

    socket.on('connect_error', (err) => {
        logger.error(`[PROBE] Socket Error: ${err.message}`);
    });
}

probeSocket();
