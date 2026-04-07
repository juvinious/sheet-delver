
import { CoreSocket } from '../../core/foundry/sockets/CoreSocket';
import { loadConfig } from '../../core/config';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query: string) => new Promise(resolve => rl.question(query, resolve));

export async function testWorldTransition() {
    logger.info('🧪 Test 3: World State Transitions\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    // Mock config if needed, or use loaded one
    const client = new CoreSocket(config.foundry);

    // Silence some logs for clarity if possible, or just let them flow
    logger.info('--- Step 1: Initial Setup Check ---');
    logger.info('Instructions: Ensure Foundry VTT is running and in "Setup" mode (World closed).');
    // await askQuestion('Press ENTER when ready...');

    logger.info('Connecting...');

    // We expect connect() to detect Setup and potentially retry, but we want to inspect state.
    // CoreSocket.connect() is perpetual. We might want to just start it and peek.
    client.connect();

    // Give it a moment to probe
    await new Promise(r => setTimeout(r, 2000));

    logger.info(`Current World State: ${client.worldState}`);
    if (client.worldState === 'setup') {
        logger.info('✅  Detected Setup Mode correctly.');
    } else {
        logger.info(`❌  Expected 'setup', got '${client.worldState}'`);
    }

    logger.info('\n--- Step 2: Start World ---');
    logger.info('Instructions: Launch your Foundry World now.');
    await askQuestion('Press ENTER after you have clicked "Launch World"...');

    logger.info('Waiting for "connect" event or state change...');

    // Poll for state changes
    let attempts = 0;
    let startupLogged = false;
    while (client.worldState !== 'active' && attempts < 20) {
        if (!startupLogged && client.worldState === 'startup') {
            logger.info('✅  Detected Startup State (World Starting...)');
            startupLogged = true;
        }
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
        attempts++;
    }
    logger.info('');

    if (client.worldState === 'active') {
        logger.info(`✅  Detected Active World: "${client.cachedWorldData?.worldTitle || 'Unknown'}"`);
    } else {
        const logger = {
            info: (msg: string) => logger.info(msg),
            warn: (msg: string) => logger.warn(msg),
            error: (msg: string) => logger.error(msg),
            debug: (msg: string) => { /* logger.debug(msg) */ } // Muted debug for standard run
        };
        logger.error(`❌  Failed to detect active world. State: ${client.worldState}`);
    }

    logger.info('\n--- Step 3: Shutdown World ---');
    logger.info('Instructions: Return to Setup (Shutdown the world). Do NOT close Foundry entirely.');
    logger.info('Waiting for heartbeat/disconnect detection...');

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
    logger.info('');

    if (client.worldState === 'setup' || client.worldState === 'offline') {
        logger.info(`✅  Detected State Change to: ${client.worldState}`);
    } else {
        logger.info(`❌  Failed to detect shutdown. State remains: ${client.worldState}`);
    }

    client.disconnect();
    rl.close();
    process.exit(0);
}

// Run immediately
testWorldTransition().catch(e => {
    logger.error(e);
    process.exit(1);
});
