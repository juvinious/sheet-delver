import { LegacySocketFoundryClient } from '../../core/foundry/legacy/LegacySocketClient';
import { loadConfig } from '../../core/config';

/**
 * Test 7: Exploratory - User Status
 * Tests if we can retrieve User documents and trust their 'active' status
 */
export async function testUserStatus() {
    console.log('🧪 Test 7: Exploratory - User Status\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new LegacySocketFoundryClient(config.foundry);

    try {
        console.log('📡 Connecting...');
        await client.connect();

        // Wait for async User Sync (getUsers) to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🔍 Fetching Users...');

        // Use getUsersDetails() to check the internal state map which should be identifying active users
        const users = await client.getUsersDetails();

        console.log(`✅ Fetched ${users.length} Users`);

        console.log('\n--- User Status Report ---');
        users.forEach((u: any) => {
            console.log(`User: ${u.name.padEnd(15)} | Active: ${u.active ? '🟢 YES' : '🔴 NO '} | Full: ${JSON.stringify(u)}`);
        });
        console.log('--------------------------\n');

        // Check if our own user is reported as active
        const myUser = users.find((u: any) => u._id === client.userId || u.id === client.userId);
        if (myUser) {
            console.log(`👤 Current User (${client.userId}) Active Status: ${myUser.active}`);
        } else {
            console.warn(`⚠️ Current user ${client.userId} not found in user list!`);
        }

        return { success: true };

    } catch (error: any) {
        console.error('❌ User status test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        console.log('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testUserStatus().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
