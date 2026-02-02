// GetJoinData Probe
// Test if we can connect as guest and fetch join data
// Usage: npx tsx src/test/socket/GetJoinDataProbe.ts

import { io } from 'socket.io-client';

import { loadConfig } from '../../core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probe() {
    console.log('[PROBE] Connecting to socket as guest...');

    const socket = io(BASE_URL, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        // No session - connecting as guest
    });

    socket.on('connect', () => {
        console.log('[PROBE] Socket connected!');
        console.log('[PROBE] Emitting getJoinData...');

        socket.emit('getJoinData', (data: any) => {
            console.log('[PROBE] Received response:');
            console.log(JSON.stringify(data, null, 2));

            if (data.users) {
                console.log(`\n[PROBE] Found ${data.users.length} users:`);
                data.users.forEach((u: any) => {
                    console.log(`  - ${u.name} (ID: ${u._id})`);
                });
            }

            socket.disconnect();
            process.exit(0);
        });

        // Timeout
        setTimeout(() => {
            console.log('[PROBE] Timeout - no response');
            socket.disconnect();
            process.exit(1);
        }, 5000);
    });

    socket.on('connect_error', (err) => {
        console.error('[PROBE] Connection error:', err.message);
        process.exit(1);
    });

    socket.on('session', (data) => {
        console.log('[PROBE] Received session event:', data);
    });
}

probe();
