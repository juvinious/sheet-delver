
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query: string) => new Promise(resolve => rl.question(query, resolve));

export async function testWorldTransition() {
    console.log('🧪 Test 3: World State Transitions\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    // Mock config if needed, or use loaded one
    const client = new CoreSocket(config.foundry);

    // Silence some logs for clarity if possible, or just let them flow
    console.log('--- Step 1: Initial Setup Check ---');
    console.log('Instructions: Ensure Foundry VTT is running and in "Setup" mode (World closed).');
    // await askQuestion('Press ENTER when ready...');

    console.log('Connecting...');

    // We expect connect() to detect Setup and potentially retry, but we want to inspect state.
    // CoreSocket.connect() is perpetual. We might want to just start it and peek.
    client.connect();

    // Give it a moment to probe
    await new Promise(r => setTimeout(r, 2000));

    console.log(`Current World State: ${client.worldState}`);
    if (client.worldState === 'setup') {
        console.log('✅  Detected Setup Mode correctly.');
    } else {
        console.log(`❌  Expected 'setup', got '${client.worldState}'`);
    }

    console.log('\n--- Step 2: Start World ---');
    console.log('Instructions: Launch your Foundry World now.');
    await askQuestion('Press ENTER after you have clicked "Launch World"...');

    console.log('Waiting for "connect" event or state change...');

    // Poll for state changes
    let attempts = 0;
    let startupLogged = false;
    while (client.worldState !== 'active' && attempts < 20) {
        if (!startupLogged && client.worldState === 'startup') {
            console.log('✅  Detected Startup State (World Starting...)');
            startupLogged = true;
        }
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
        attempts++;
    }
    console.log('');

    if (client.worldState === 'active') {
        console.log(`✅  Detected Active World: "${client.cachedWorldData?.worldTitle || 'Unknown'}"`);
    } else {
        const logger = {
            info: (msg: string) => console.log(msg),
            warn: (msg: string) => console.warn(msg),
            error: (msg: string) => console.error(msg),
            debug: (msg: string) => { /* console.debug(msg) */ } // Muted debug for standard run
        };
        logger.error(`❌  Failed to detect active world. State: ${client.worldState}`);
    }

    console.log('\n--- Step 3: Shutdown World ---');
    console.log('Instructions: Return to Setup (Shutdown the world). Do NOT close Foundry entirely.');
    console.log('Waiting for heartbeat/disconnect detection...');

    // We don't ask for Enter here, we just watch.
    // The heartbeat is 15s. We'll wait up to 30s.
    attempts = 0;
    const maxWait = 30; // seconds
    const startState = client.worldState;

    while (client.worldState === 'active' && attempts < maxWait) {
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
        attempts++;
    }
    console.log('');

    if (client.worldState === 'setup' || client.worldState === 'offline') {
        console.log(`✅  Detected State Change to: ${client.worldState}`);
    } else {
        console.log(`❌  Failed to detect shutdown. State remains: ${client.worldState}`);
    }

    client.disconnect();
    rl.close();
    process.exit(0);
}

// Run immediately
testWorldTransition().catch(e => {
    console.error(e);
    process.exit(1);
});
