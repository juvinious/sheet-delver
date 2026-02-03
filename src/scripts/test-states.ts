#!/usr/bin/env ts-node
/**
 * Interactive State Machine Test
 * 
 * This script tests the Foundry VTT state machine by connecting directly to
 * the Foundry server and verifying state detection works correctly.
 * 
 * Usage: npm run test:states
 */

import * as readline from 'readline';
import { loadConfig } from '../core/config';
import { SocketFoundryClient } from '../core/foundry/SocketClient';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

interface TestResult {
    step: string;
    expected: string;
    actual: string;
    passed: boolean;
    notes?: string;
}

const results: TestResult[] = [];
let client: SocketFoundryClient | null = null;

function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function initializeClient(): Promise<void> {
    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration from settings.yaml');
    }

    console.log(`\n📡 Connecting to Foundry at: ${config.foundry.url}`);
    console.log(`👤 Username: ${config.foundry.username}\n`);

    client = new SocketFoundryClient(config.foundry);
    await client.connect();

    console.log('✅ Connected to Foundry!\n');
}

async function getState(): Promise<{ status: string; worldTitle?: string; systemId?: string; isLoggedIn?: boolean }> {
    if (!client) {
        throw new Error('Client not initialized');
    }

    const status = client.status;
    const systemData = await client.getSystem();

    return {
        status,
        worldTitle: systemData.worldTitle,
        systemId: systemData.id,
        isLoggedIn: systemData.isLoggedIn
    };
}

function logResult(result: TestResult) {
    results.push(result);
    const icon = result.passed ? '✅' : '❌';
    console.log(`\n${icon} ${result.step}`);
    console.log(`   Expected: ${result.expected}`);
    console.log(`   Actual: ${result.actual}`);
    if (result.notes) {
        console.log(`   Notes: ${result.notes}`);
    }
}

function printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    if (total - passed > 0) {
        console.log('Failed Tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.step}`);
            console.log(`    Expected: ${r.expected}, Got: ${r.actual}`);
        });
    }
}

async function runTest() {
    console.log('\n' + '='.repeat(60));
    console.log('FOUNDRY VTT STATE MACHINE TEST');
    console.log('='.repeat(60));
    console.log('\nThis test verifies that SocketFoundryClient correctly detects');
    console.log('Foundry server states by connecting directly to Foundry.\n');

    try {
        await initializeClient();
    } catch (error: any) {
        console.error('❌ Failed to connect to Foundry:', error.message);
        console.log('\nPlease ensure:');
        console.log('1. Foundry VTT is running');
        console.log('2. settings.yaml has correct URL and credentials');
        rl.close();
        process.exit(1);
    }

    await question('Press Enter to start the test...');

    // Test 1: Setup Mode
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 1: Setup Mode Detection');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. In Foundry VTT, ensure you are on the setup/world selection screen');
    console.log('2. If a world is running, shut it down first');

    await question('\nPress Enter when Foundry is in setup mode...');

    const setupState = await getState();
    logResult({
        step: 'Setup Mode Detection',
        expected: 'status: "setup"',
        actual: `status: "${setupState.status}"`,
        passed: setupState.status === 'setup',
        notes: setupState.systemId ? `System ID: ${setupState.systemId}` : 'No system ID (expected in setup mode)'
    });

    await question('\nPress Enter to continue to next test...');

    // Test 2: World Start
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 2: World Start Detection');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. In Foundry VTT, click "Launch World" on any world');
    console.log('2. Wait for the world to start loading');

    await question('\nPress Enter when you have launched a world...');

    // Wait a moment for the state to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const startupState = await getState();
    logResult({
        step: 'World Startup Detection',
        expected: 'status: "startup" or "connected" or "loggedIn"',
        actual: `status: "${startupState.status}", isLoggedIn: ${startupState.isLoggedIn}`,
        passed: ['startup', 'connected', 'loggedIn'].includes(startupState.status),
        notes: startupState.worldTitle ? `World: ${startupState.worldTitle}` : undefined
    });

    // Wait for world to fully start
    console.log('\n⏳ Waiting for world to fully start (max 45 seconds)...');
    // Check immediately first
    let state = await getState();
    let worldReady = ['connected', 'loggedIn'].includes(state.status);
    let attempts = 0;
    const maxAttempts = 15; // 45 seconds

    if (worldReady) {
        console.log(`✓ World already ready on first check (Instant)`);
    }

    while (!worldReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        state = await getState();
        if (['connected', 'loggedIn'].includes(state.status)) {
            worldReady = true;
            console.log(`✓ World ready after ${(attempts + 1) * 3} seconds`);
        } else {
            process.stdout.write('.');
            attempts++;
        }
    }

    const readyState = await getState();
    logResult({
        step: 'World Ready State',
        expected: 'status: "connected" or "loggedIn"',
        actual: `status: "${readyState.status}", isLoggedIn: ${readyState.isLoggedIn}`,
        passed: ['connected', 'loggedIn'].includes(readyState.status),
        notes: `Took ${attempts * 3} seconds to reach ready state. World: ${readyState.worldTitle}, System: ${readyState.systemId}`
    });

    await question('\nPress Enter to continue to next test...');

    // Test 3: Return to Setup
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 3: World Shutdown Detection');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. In Foundry VTT, click "Return to Setup"');

    await question('\nPress Enter when you have returned to setup...');

    // Wait a moment for the state to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const shutdownState = await getState();
    logResult({
        step: 'World Shutdown Detection',
        expected: 'status: "setup"',
        actual: `status: "${shutdownState.status}"`,
        passed: shutdownState.status === 'setup'
    });

    await question('\nPress Enter to continue to next test...');

    // Test 4: Start Different World
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 4: World Switching');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. In Foundry VTT, launch a DIFFERENT world than before');
    console.log('2. Wait for it to fully start');

    await question('\nPress Enter when you have launched a different world...');

    // Wait for world to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    const switchState = await getState();
    const previousWorld = readyState.worldTitle;
    const currentWorld = switchState.worldTitle;

    logResult({
        step: 'World Switch Detection',
        expected: 'Different world title, status: "startup" or "connected" or "loggedIn"',
        actual: `World: "${currentWorld}", status: "${switchState.status}"`,
        passed: currentWorld !== previousWorld && ['startup', 'connected', 'loggedIn'].includes(switchState.status),
        notes: `Previous: "${previousWorld}", Current: "${currentWorld}"`
    });

    await question('\nPress Enter to continue to next test...');

    // Test 5: Return to Setup Again
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 5: Second Shutdown Detection');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. In Foundry VTT, click "Return to Setup" again');

    await question('\nPress Enter when you have returned to setup...');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const secondShutdownState = await getState();
    logResult({
        step: 'Second Shutdown Detection',
        expected: 'status: "setup"',
        actual: `status: "${secondShutdownState.status}"`,
        passed: secondShutdownState.status === 'setup'
    });

    await question('\nPress Enter to continue to final test...');

    // Test 6: Malformed URL
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 6: Malformed URL Handling');
    console.log('-'.repeat(60));
    console.log('\n📋 INSTRUCTIONS:');
    console.log('1. This test will attempt to connect to an invalid URL');
    console.log('2. We will create a new client with a bad URL');
    console.log('3. It should fail gracefully without crashing');

    await question('\nPress Enter to test malformed URL...');

    try {
        const badConfig = {
            url: 'https://invalid-foundry-url.example.com',
            username: 'test',
            password: 'test'
        };

        const badClient = new SocketFoundryClient(badConfig);
        await badClient.connect();

        // If we get here, something is wrong
        logResult({
            step: 'Malformed URL Handling',
            expected: 'Connection should fail gracefully',
            actual: 'Connection succeeded (unexpected)',
            passed: false,
            notes: 'Bad URL should not connect successfully'
        });
    } catch (error: any) {
        // This is expected
        logResult({
            step: 'Malformed URL Handling',
            expected: 'Connection fails gracefully with error',
            actual: `Failed with: ${error.message}`,
            passed: true,
            notes: 'Graceful failure is expected behavior'
        });
    }

    // Cleanup
    if (client) {
        client.disconnect('Test complete');
    }

    // Print summary
    printSummary();

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));

    rl.close();
}

// Run the test
runTest().catch(error => {
    console.error('\n❌ Test failed with error:', error);
    if (client) {
        client.disconnect('Test error');
    }
    rl.close();
    process.exit(1);
});
