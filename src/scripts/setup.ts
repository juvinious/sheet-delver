
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

// Load Settings
const SETTINGS_PATH = path.join(process.cwd(), 'settings.yaml');
let port = 3000;

try {
    if (fs.existsSync(SETTINGS_PATH)) {
        const fileContents = fs.readFileSync(SETTINGS_PATH, 'utf8');
        const settings = yaml.load(fileContents) as any;
        if (settings.app && settings.app.port) port = settings.app.port;
    }
} catch (e) {
    console.error('[Setup] Error reading settings.yaml:', e);
}

let coreProcess: ChildProcess | null = null;
let cliProcess: ChildProcess | null = null;

function cleanup() {
    console.log('\n[Setup] Shutting down services...');
    if (coreProcess) coreProcess.kill('SIGINT');
    if (cliProcess) cliProcess.kill('SIGINT');
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

async function startSetup() {
    console.log('===================================================');
    console.log('       SheeDelver First-Time Setup Mode            ');
    console.log('===================================================');
    console.log('1. Starting Core Service (Headless)...');

    // Start Core Service
    coreProcess = spawn('npx', ['-y', 'tsx', 'src/server/index.ts'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: (port + 1).toString() }
    });

    // Wait briefly for Core to Init
    await new Promise(r => setTimeout(r, 2000));

    console.log('\n2. Starting Admin CLI...');
    console.log('---------------------------------------------------');
    console.log('INSTRUCTIONS:');
    console.log('1. Login to Foundry VTT as Gamemaster in your browser.');
    console.log('2. Open DevTools (F12) -> Network Tab -> Filter "game".');
    console.log('3. Refresh the page. Click the "game" request.');
    console.log('4. Copy the "Cookie" value from Request Headers.');
    console.log('5. In the CLI below, type: scrape <paste_cookie>');
    console.log('---------------------------------------------------\n');

    // Start CLI
    cliProcess = spawn('npx', ['-y', 'tsx', 'src/cli/index.ts'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: (port + 1).toString() } // connect to local core
    });

    cliProcess.on('close', (code) => {
        console.log('[Setup] CLI exited. Shutting down.');
        cleanup();
        process.exit(code || 0);
    });
}

startSetup().catch(e => {
    console.error('[Setup] Fatal Error:', e);
    cleanup();
    process.exit(1);
});
