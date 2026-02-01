
// Socket Probe Script
// Location: src/test/socket/SocketProbe.ts
// Usage: npx tsx src/test/socket/SocketProbe.ts

import { io } from 'socket.io-client';
// Polyfill fetch
const fetch = global.fetch;

import { loadConfig } from '../../lib/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probeSocket() {
    console.log(`[PROBE] Fetching ${BASE_URL}/join for guest cookie...`);
    const res = await fetch(`${BASE_URL}/join`);
    const setCookie = res.headers.get('set-cookie');

    if (!setCookie) {
        console.error("No cookie received!");
        return;
    }

    const sessionCookie = setCookie.split(';')[0];
    console.log(`[PROBE] Got Cookie: ${sessionCookie}`);

    // Parse Session ID for socket query (usually needed)
    // session=xxxx
    const sessionId = sessionCookie.split('=')[1];

    console.log(`[PROBE] Connecting to socket...`);
    const socket = io(`${BASE_URL}`, {
        path: '/socket.io',
        query: { session: sessionId },
        extraHeaders: {
            Cookie: sessionCookie
        },
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log(`[PROBE] Socket Connected! ID: ${socket.id}`);

        // Try to fetch users immediately
        console.log(`[PROBE] Emitting 'modifyDocument' for User get...`);
        socket.emit('modifyDocument', {
            type: 'User',
            action: 'get',
            operation: { action: 'get', broadcast: false }
        }, (response: any) => {
            console.log(`[PROBE] Received Response!`);
            // console.log(JSON.stringify(response, null, 2));

            if (response && response.result) {
                console.log(`[PROBE] Found ${response.result.length} users.`);
                response.result.forEach((u: any) => {
                    console.log(` - User: ${u.name} (ID: ${u._id})`);
                });
            } else {
                console.log(`[PROBE] Response empty or denied.`);
            }

            socket.disconnect();
            process.exit(0);
        });

        // Set a timeout
        setTimeout(() => {
            console.log("[PROBE] Timeout waiting for response.");
            socket.disconnect();
            process.exit(1);
        }, 5000);
    });

    socket.on('connect_error', (err) => {
        console.error(`[PROBE] Socket Error: ${err.message}`);
    });
}

probeSocket();
