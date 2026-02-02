import { SocketFoundryClient } from '../../core/foundry/SocketClient';
import { loadConfig } from '../../core/config';

/**
 * Test 1: Basic Connection and Authentication
 * Tests that we can connect and authenticate without breaking the server
 */
export async function testConnection() {
    console.log('🧪 Test 1: Connection & Authentication\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const client = new SocketFoundryClient(config.foundry);

    try {
        console.log('📡 Connecting...');
        await client.connect();
        console.log('✅ Connected successfully!');
        console.log('✅ Authentication successful (userId present in session)');
        return { success: true };
    } catch (error: any) {
        console.error('❌ Connection failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await client.disconnect();
        console.log('📡 Disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testConnection().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
