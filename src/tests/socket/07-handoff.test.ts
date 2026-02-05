
import { LegacySocketFoundryClient } from '../../core/foundry/legacy/LegacySocketClient';
import { loadConfig } from '../../core/config';
import * as readline from 'readline';

async function prompt(question: string, mask: boolean = false): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        if (!mask) {
            rl.question(question, answer => {
                rl.close();
                resolve(answer);
            });
        } else {
            process.stdout.write(question);
            let input = '';

            // Raw mode for character masking
            const stdin = process.stdin;
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');

            const onData = (char: string) => {
                const charCode = char.charCodeAt(0);

                if (charCode === 13 || charCode === 10) { // Enter
                    stdin.removeListener('data', onData);
                    stdin.setRawMode(false);
                    stdin.pause();
                    process.stdout.write('\n');
                    rl.close();
                    resolve(input);
                } else if (charCode === 127 || charCode === 8) { // Backspace
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                } else if (charCode === 3) { // Ctrl+C
                    process.exit(0);
                } else {
                    input += char;
                    process.stdout.write('*');
                }
            };

            stdin.on('data', onData);
        }
    });
}

/**
 * Test 7: Connection Handoff
 * Simulates the background polling vs foreground login race condition.
 */
export async function testConnectionHandoff() {
    console.log('🧪 Test 7: Connection Handoff Flow\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    // Step 1: Gather credentials first to avoid terminal noise
    console.log('--- Action Required ---');
    console.log('Foundry URL:', config.foundry.url);
    const username = await prompt('Enter Player Username: ');
    const password = await prompt('Enter Player Password: ', true);

    // Instance 1: The "Background Poller" (System User)
    console.log('\n1. Starting Background Client (System User)...');
    const backgroundClient = new LegacySocketFoundryClient(config.foundry);

    // Instance 2: The "Interactive Login" (Player)
    console.log('2. Starting Player Client (Interactive)...');
    const playerClient = new LegacySocketFoundryClient(config.foundry);

    try {
        // Step A: Background client connects
        console.log('   [Background] Connecting...');
        await backgroundClient.connect();
        console.log('   [Background] ✅ Connected');

        // Step B: Simulate background polling while player tries to login
        console.log('\n3. Simulating concurrent activity...');

        const backgroundPoll = setInterval(async () => {
            try {
                const sys = await backgroundClient.getSystem();
                console.log(`   [Background] Polling status | isLoggedIn: ${sys.isLoggedIn}`);
            } catch (e: any) {
                console.log(`   [Background] ⚠️ Poll failed: ${e.message}`);
            }
        }, 2000);

        console.log(`\n4. [Player] Logging in as "${username}"...`);
        console.log('   (Background poll should continue without killing the player session)');

        await playerClient.login(username, password);

        if (playerClient.isLoggedIn) {
            console.log(`   [Player] ✅ Successfully logged in as ${playerClient.userId}`);

            console.log('\n5. Verifying Stability (Waiting 10 seconds)...');
            await new Promise(r => setTimeout(r, 10000));

            if (playerClient.isConnected && playerClient.isLoggedIn) {
                console.log('   ✅ Player session is still stable after 10 seconds of background polling.');
            } else {
                throw new Error('Player session was lost during background polling!');
            }
        } else {
            throw new Error('Player login failed or status remained inactive.');
        }

        clearInterval(backgroundPoll);
        return { success: true };

    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await backgroundClient.disconnect();
        await playerClient.disconnect();
        console.log('\n📡 All clients disconnected\n');
    }
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    testConnectionHandoff().then(result => {
        process.exit(result.success ? 0 : 1);
    });
}
