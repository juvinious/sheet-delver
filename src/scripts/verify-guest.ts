
import { SocketFoundryClient } from '../core/foundry/SocketClient';
import { logger } from '../core/logger';
import { config } from '../config';

async function main() {
    console.log('--- Verifying Guest Client Connection ---');

    console.log(`Target URL: ${config.foundry.url}`);

    const client = new SocketFoundryClient({
        url: config.foundry.url,
        username: '', // Guest
        password: '',
        userId: '',
        foundryDataDirectory: config.foundry.foundryDataDirectory
    });


    try {
        console.log('1. Connecting...');
        await client.connect();
        console.log('   Connection successful (or yielded).');
        console.log(`   Connected: ${client.isConnected}`);
        console.log(`   World State: ${client.worldState}`);

        console.log('\n2. Verifying System Data (getSystem)..');
        const system = await client.getSystem();
        console.log('   Result:', JSON.stringify(system, null, 2));

        if (system.id === 'generic' && system.title === 'Unknown World') {
            console.warn('   [WARN] System returned generic/unknown. Probe might have failed.');
        } else {
            console.log('   [SUCCESS] System data retrieved.');
        }

        console.log('\n3. Verifying Users (getUsers)...');
        const users = await client.getUsers();
        console.log(`   Count: ${users.length}`);
        if (users.length > 0) {
            console.log('   [SUCCESS] Users retrieved.');
            console.log('   Sample:', users[0]);
        } else {
            console.warn('   [WARN] No users found. (Could be empty world, or probe failure).');
        }

    } catch (e) {
        console.error('CRITICAL FAILURE:', e);
    } finally {
        console.log('\nClosing connection...');
        client.disconnect();
        process.exit(0);
    }
}

main();
