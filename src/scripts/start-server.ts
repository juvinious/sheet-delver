
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { spawn, ChildProcess } from 'child_process';

const SETTINGS_PATH = path.join(process.cwd(), 'settings.yaml');

// Default settings
let host = 'localhost';
let port = 3000;

// Read settings.yaml
try {
    if (fs.existsSync(SETTINGS_PATH)) {
        const fileContents = fs.readFileSync(SETTINGS_PATH, 'utf8');
        const settings = yaml.load(fileContents) as any;

        if (settings.app) {
            if (settings.app.host) host = settings.app.host;
            if (settings.app.port) port = settings.app.port;
        }

        console.log(`[Manager] Loading configuration from settings.yaml: ${host}:${port}`);
    } else {
        console.log('[Manager] No settings.yaml found, using defaults.');
    }
} catch (e) {
    console.error('[Manager] Error reading settings.yaml:', e);
}

// Determine command (dev or start)
const args = process.argv.slice(2);
const command = args[0] || 'dev'; // Default to dev

// Pre-flight Check: Ensure Cache Exists
const CACHE_PATH = path.join(process.cwd(), '.foundry-cache.json');
if (!fs.existsSync(CACHE_PATH)) {
    console.error('\n\x1b[31m[CRITICAL] Cache Missing: .foundry-cache.json not found.\x1b[0m');
    console.error('The application cannot start without initial world data.');
    console.error('Please run the setup script to initialize the cache:');
    console.error('\n    \x1b[36mnpm run setup\x1b[0m\n');
    process.exit(1);
}

let coreProcess: ChildProcess | null = null;
let shellProcess: ChildProcess | null = null;

function cleanup() {
    console.log('\n[Manager] Shutting down services...');
    if (coreProcess) {
        console.log('[Manager] Stopping Core Service...');
        coreProcess.kill('SIGINT');
    }
    if (shellProcess) {
        console.log('[Manager] Stopping Shell Service...');
        shellProcess.kill('SIGINT');
    }
}

// Handle termination signals
process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

async function start() {
    console.log('[Manager] Starting Decoupled Architecture...');

    // 1. Start Core Service
    console.log(`[Manager] Launching Core Service (Express)...`);
    coreProcess = spawn('npx', ['-y', 'tsx', 'src/server/index.ts'], {
        stdio: 'inherit',
        env: { ...process.env, PORT: (port + 1).toString() }
    });

    coreProcess.on('error', (err) => {
        console.error('[Manager] Core Service failed to start:', err);
        cleanup();
        process.exit(1);
    });

    coreProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`[Manager] Core Service crashed with code ${code}`);
        } else {
            console.log(`[Manager] Core Service exited.`);
        }
        cleanup();
        process.exit(code || 0);
    });

    // 2. Start Shell Service
    console.log(`[Manager] Launching Shell Service (Next.js ${command}) on ${host}:${port}...`);
    const nextCmd = path.join(process.cwd(), 'node_modules', '.bin', 'next');
    shellProcess = spawn(nextCmd, [command, '-H', host, '-p', port.toString()], {
        stdio: 'inherit',
        env: { ...process.env, PORT: port.toString(), HOSTNAME: host }
    });

    shellProcess.on('error', (err) => {
        console.error('[Manager] Shell Service failed to start:', err);
        cleanup();
        process.exit(1);
    });

    shellProcess.on('close', (code) => {
        console.log(`[Manager] Shell Service exited with code ${code}`);
        cleanup();
        process.exit(code || 0);
    });
}

start().catch(err => {
    console.error('[Manager] Fatal error during startup:', err);
    cleanup();
    process.exit(1);
});
