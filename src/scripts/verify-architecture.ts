
import { CoreSocket } from '../core/foundry/sockets/CoreSocket';
import { ClientSocket } from '../core/foundry/sockets/ClientSocket';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../core/logger';

// Set logger to info for visibility
(logger as any).level = 'info';

const loadSettings = () => {
    const settingsPath = path.resolve(process.cwd(), 'settings.yaml');
    const fileContents = fs.readFileSync(settingsPath, 'utf8');
    return yaml.load(fileContents) as any;
};

const settings = loadSettings();

async function verify() {
    console.log('=== Architecture Verification ===');

    // 1. Test CoreSocket (Data Hub / Service Account)
    console.log('\n[1] Initializing CoreSocket...');
    const core = new CoreSocket(settings.foundry);

    try {
        await core.connect();
        console.log('CoreSocket connected successfully.');
        console.log('World State:', core.worldState);

        const gameData = core.getGameData();
        console.log('Game Data loaded:', !!gameData);
        if (gameData) {
            console.log('World Title:', gameData.world.title);
            console.log('System:', gameData.system.id);
        }
    } catch (e: any) {
        console.error('CoreSocket verification failed:', e.message);
        // Don't exit yet, try ClientSocket
    }

    // 2. Test ClientSocket (Auth Anchor / Presence)
    console.log('\n[2] Initializing ClientSocket...');
    const client = new ClientSocket(settings.foundry, core);

    try {
        // Authenticate
        await client.login();
        console.log('ClientSocket connected/logged in successfully.');
        console.log('User ID:', client.userId);

        // Test Proxying
        console.log('\n[3] Testing Proxying (ClientSocket -> CoreSocket)...');
        const actors = await client.getActors();
        console.log(`Proxied getActors() count: ${actors.length}`);

        const chat = await client.getChatLog(1);
        console.log(`Proxied getChatLog() count: ${chat.length}`);
        if (chat.length > 0) {
            console.log('Latest Message Author:', chat[0].user);
        }

    } catch (e: any) {
        console.error('ClientSocket verification failed:', e.message);
    }

    console.log('\n=== Verification Finished ===');

    // Cleanup
    core.disconnect();
    client.disconnect();
    process.exit(0);
}

verify().catch(e => {
    console.error('Fatal verification error:', e);
    process.exit(1);
});
