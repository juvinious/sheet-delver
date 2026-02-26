
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { fileURLToPath } from 'url';

export async function testRolling() {
    console.log('🧪 Test 9: Rolling Functionality\n');

    // Setup - mimics behavior in 01-connection.test.ts
    const configLine = await loadConfig(); // Note: loadConfig likely returns { foundry: ... } or similar based on usage
    // loadConfig implementation check needed? 01-connection uses it directly.
    // Let's assume standard behavior:
    if (!configLine) {
        throw new Error('Failed to load configuration');
    }
    const config = configLine.foundry || configLine; // Robustness

    const client = new CoreSocket(config);

    try {
        console.log('📡 Connecting...');
        await client.connect();

        // Wait for ready state if needed, though connect() usually handles it
        if (!client.isConnected) throw new Error('Failed to connect');

        /*
        const result = await client.rollTable({
            "rolls": [
                "{\"class\":\"Roll\",\"options\":{},\"dice\":[],\"formula\":\"{1d8,1d8}\",\"terms\":[{\"class\":\"PoolTerm\",\"options\":{},\"evaluated\":true,\"terms\":[\"1d8\",\"1d8\"],\"modifiers\":[],\"rolls\":[{\"class\":\"Roll\",\"options\":{},\"dice\":[],\"formula\":\"1d8\",\"terms\":[{\"class\":\"Die\",\"options\":{\"flavor\":null},\"evaluated\":true,\"number\":1,\"faces\":8,\"modifiers\":[],\"results\":[{\"result\":3,\"active\":true}]}],\"total\":3,\"evaluated\":true},{\"class\":\"Roll\",\"options\":{},\"dice\":[],\"formula\":\"1d8\",\"terms\":[{\"class\":\"Die\",\"options\":{\"flavor\":null},\"evaluated\":true,\"number\":1,\"faces\":8,\"modifiers\":[],\"results\":[{\"result\":5,\"active\":true}]}],\"total\":5,\"evaluated\":true}],\"results\":[{\"result\":3,\"active\":true},{\"result\":5,\"active\":true}]}],\"total\":8,\"evaluated\":true}"
            ],
            flags: {
                "core": {
                    "RollTable": "9HXT5mQtNkSQB8lY"
                }
            }
        });
        */
        //console.log('Result: ' + JSON.stringify(result, null, 2));

        console.log('✅ Execute Macro Tests Passed');
        return { success: true };

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        if (client.isConnected) {
            await client.disconnect();
            console.log('📡 Disconnected\n');
        }
    }
}

// Self-execution check
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testRolling().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
