
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import { logger } from '../../core/logger'; // Use project logger
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

        // 1. Roll Basic Dice
        console.log('\n--- Part 1: Basic Roll (1d6) ---');
        const roll1 = await client.roll('1d6', 'Test Roll 1');
        console.log('Result:', JSON.stringify(roll1, null, 2));

        if (!roll1 || !roll1._id) {
            throw new Error('Roll 1 failed - no ChatMessage created');
        }
        if (roll1.type !== 0 && roll1.type !== 'base') {
            throw new Error(`Roll 1 type mismatch. Expected 0 or 'base', got ${roll1.type}`);
        }

        // 2. Roll Complex Formula
        console.log('\n--- Part 2: Complex Roll (1d20 + 5) ---');
        const roll2 = await client.roll('1d20 + 5', 'Test Roll 2');
        console.log('Result:', JSON.stringify(roll2, null, 2));

        if (!roll2 || !roll2.content) {
            throw new Error('Roll 2 failed - content missing');
        }

        // Verify content is numeric string
        const total = parseInt(roll2.content);
        if (isNaN(total)) {
            throw new Error(`Roll 2 content is not a number: ${roll2.content}`);
        }

        console.log('✅ Rolling Tests Passed');
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
