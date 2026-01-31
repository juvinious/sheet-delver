
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { spawn } from 'child_process';

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

        console.log(`Loading configuration from settings.yaml: ${host}:${port}`);
    } else {
        console.log('No settings.yaml found, using defaults.');
    }
} catch (e) {
    console.error('Error reading settings.yaml:', e);
}

// Determine command (dev or start)
const args = process.argv.slice(2);
const command = args[0] || 'dev'; // Default to dev

console.log(`Starting Next.js (${command}) on ${host}:${port}...`);

// Spawn Next.js
const nextCmd = path.join(process.cwd(), 'node_modules', '.bin', 'next');
const child = spawn(nextCmd, [command, '-H', host, '-p', port.toString()], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port.toString(), HOSTNAME: host }
});

child.on('close', (code) => {
    process.exit(code || 0);
});
