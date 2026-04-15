
import inquirer from 'inquirer';
import { loadConfig } from '@core/config';
import { DirectScraper } from '@core/foundry/DirectScraper';
import { SetupManager, WorldData } from '@core/foundry/SetupManager';
import path from 'path';
import fs from 'fs';
import { logger } from '@shared/utils/logger';

/**
 * Command Definition
 */
interface Command {
    key: string;       // Shorthand (e.g., 'v')
    label: string;     // Full name (e.g., 'View Status')
    description: string;
    action: () => Promise<void> | void;
}

async function main() {
    // 1. Check for Direct Command (CLI Arguments)
    const args = process.argv.slice(2);
    if (args[0] === 'import') {
        const dataPathArg = args[1];
        if (!dataPathArg) {
            logger.error('\x1b[31mError:\x1b[0m Please provide paths to the Foundry Data directory.');
            logger.info('Usage: npm run admin import <FoundryDataPath>');
            logger.info('Example: npm run admin import /home/user/.local/share/FoundryVTT/Data');
            process.exit(1);
        }

        const resolvedPath = path.resolve(process.cwd(), dataPathArg);
        if (!fs.existsSync(resolvedPath)) {
            logger.error(`\x1b[31mError:\x1b[0m Path not found: ${resolvedPath}`);
            process.exit(1);
        }

        logger.info(`\x1b[36mRunning Direct Batch Import on:\x1b[0m ${resolvedPath}`);
        try {
            logger.info('Discovering worlds...');
            const worlds = await DirectScraper.discover(resolvedPath);

            if (worlds.length === 0) {
                logger.info('\x1b[33mNo worlds found in that directory.\x1b[0m');
                process.exit(0);
            }

            logger.info(`Found ${worlds.length} worlds. Importing...`);
            const cacheUpdates: WorldData[] = [];

            for (const world of worlds) {
                try {
                    logger.info(` - Scraping ${world.title} (${world.id})...`);
                    const data = await DirectScraper.scrape(world.path);

                    cacheUpdates.push({
                        worldId: data.id,
                        worldTitle: data.title,
                        worldDescription: data.description,
                        systemId: data.system,
                        backgroundUrl: data.background,
                        users: data.users.map(u => ({ _id: u.id, name: u.name, role: u.role })),
                        lastUpdated: new Date().toISOString(),
                        data: { ...data }
                    });
                } catch (err: any) {
                    logger.error(`   \x1b[31mFailed to scrape ${world.id}:\x1b[0m ${err.message}`);
                }
            }

            if (cacheUpdates.length > 0) {
                await SetupManager.saveBatchCache(cacheUpdates);
                logger.info(`\n\x1b[32mSuccessfully imported ${cacheUpdates.length}/${worlds.length} worlds.\x1b[0m`);
                logger.info(`\x1b[33mCache updated. Application will hot-reload if running.\x1b[0m\n`);
            } else {
                logger.info('\n\x1b[31mNo worlds were successfully imported.\x1b[0m\n');
                process.exit(1);
            }
            process.exit(0);
        } catch (e: any) {
            logger.error(`\x1b[31mImport Failed:\x1b[0m ${e.message}`);
            process.exit(1);
        }
    }

    // 2. Interactive Mode
    const config = await loadConfig();
    if (!config) {
        logger.error('\x1b[31mError:\x1b[0m Failed to load config.');
        process.exit(1);
    }

    const adminUrl = `http://127.0.0.1:${config.app.port + 1}/admin`;

    logger.info('\x1b[36m%s\x1b[0m', '--- SheetDelver Admin CLI ---');
    logger.info(`Connecting to Core Service at: ${adminUrl}\n`);

    const commands: Command[] = [
        {
            key: 'v',
            label: 'View Status',
            description: 'Check connectivity and world state',
            action: async () => {
                const res = await fetchWithTimeout(`${adminUrl}/status`);
                logger.info('\n\x1b[32m--- Core Service Status ---\x1b[0m');
                console.table(await res.json());
            }
        },
        {
            key: 'i',
            label: 'Import Worlds',
            description: 'Directly import Foundry worlds from disk',
            action: async () => {
                logger.info('\n\x1b[36m--- Direct World Import ---\x1b[0m');

                let dataPath = config.foundry.foundryDataDirectory;

                if (!dataPath) {
                    const ans = await inquirer.prompt([{
                        type: 'input',
                        name: 'path',
                        message: 'Enter path to Foundry Data directory:'
                    }]);
                    dataPath = ans.path;
                }

                if (!dataPath) {
                    logger.info('Operation cancelled.');
                    return;
                }

                try {
                    logger.info(`Scanning for worlds in: ${dataPath}...`);
                    const worlds = await DirectScraper.discover(dataPath);

                    if (worlds.length === 0) {
                        logger.info('\x1b[33mNo worlds found in that directory.\x1b[0m');
                        return;
                    }

                    const { selectedWorld } = await inquirer.prompt([{
                        type: 'list',
                        name: 'selectedWorld',
                        message: 'Select world to import:',
                        choices: worlds.map(w => ({
                            name: `${w.title} (${w.system})`,
                            value: w.path
                        }))
                    }]);

                    logger.info(`Importing world from ${selectedWorld}...`);
                    const data = await DirectScraper.scrape(selectedWorld);

                    // Map to Cache Format
                    const cacheData: WorldData = {
                        worldId: data.id,
                        worldTitle: data.title,
                        worldDescription: data.description,
                        systemId: data.system,
                        backgroundUrl: data.background,
                        users: data.users.map(u => ({ _id: u.id, name: u.name, role: u.role })),
                        lastUpdated: new Date().toISOString(),
                        data: { ...data }
                    };

                    await SetupManager.saveCache(cacheData);
                    logger.info('\n\x1b[32mImport Successful!\x1b[0m');
                    logger.info(`Active World set to: ${data.title}`);
                    logger.info(`\x1b[33mApplication hot-reload triggered.\x1b[0m\n`);

                } catch (e: any) {
                    logger.error(`\x1b[31mError:\x1b[0m ${e.message}`);
                }
            }
        },
        /*
        {
            key: 'd',
            label: 'Discover (Web)',
            description: 'Scrape via Web Interface (Foundry Server)',
            action: async () => {
                logger.info('Scraping worlds...');
                const res = await fetchWithTimeout(`${adminUrl}/worlds`);
                const worlds = await res.json();
                if (worlds.length === 0) {
                    logger.info('\x1b[33mNo worlds discovered.\x1b[0m (Try refreshing or verify setup page access)');
                } else {
                    console.table(worlds.map((w: any) => ({
                        id: w.worldId || w.id,
                        title: w.worldTitle || w.title,
                        system: w.systemId || w.system
                    })));
                }
            }
        },
        */
        {
            key: 's',
            label: 'Start World',
            description: 'Launch a specific Foundry world',
            action: async () => {
                const wRes = await fetchWithTimeout(`${adminUrl}/worlds`);
                const ws = await wRes.json();
                if (ws.length === 0) {
                    logger.info('\x1b[33mNo worlds available to start.\x1b[0m');
                    return;
                }

                const { worldId } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'worldId',
                        message: 'Select world to launch:',
                        choices: ws.map((w: any) => ({
                            name: w.worldTitle || w.title,
                            value: w.worldId || w.id
                        }))
                    }
                ]);

                const launchRes = await fetchWithTimeout(`${adminUrl}/world/launch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ worldId })
                });
                logger.info(await launchRes.json());
            }
        },
        {
            key: 'h',
            label: 'Shutdown World',
            description: 'Gracefully shut down the current world',
            action: async () => {
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: 'Are you sure you want to shut down the current world?',
                        default: false
                    }
                ]);
                if (confirm) {
                    const res = await fetchWithTimeout(`${adminUrl}/world/shutdown`, { method: 'POST' });
                    logger.info(await res.json());
                }
            }
        },
        {
            key: 'c',
            label: 'Configure/Setup',
            description: 'Run initial setup by scraping world data (Manual Cookie)',
            action: async () => {
                const { token } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'token',
                        message: 'Paste your session cookie (e.g., "session=s%3A..."):',
                        validate: (input) => input.trim().length > 10 || 'Cookie too short to be valid'
                    }
                ]);

                logger.info('Running setup scrape...');
                const res = await fetchWithTimeout(`${adminUrl}/setup/scrape`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionCookie: token.trim() })
                });

                const result = await res.json();
                logger.info('\n\x1b[32mSetup Successful!\x1b[0m');
                logger.info(`World: ${result.data.worldTitle} (${result.data.worldId})`);
                logger.info(`System: ${result.data.systemId}`);
                logger.info(`Users: ${result.data.users.length} discovered`);
                logger.info(`\n\x1b[33mConfiguration saved. You can now restart the Core Service to apply changes.\x1b[0m\n`);
            }
        },
        {
            key: 'l',
            label: 'List Cache',
            description: 'View current cached configuration',
            action: async () => {
                logger.info('Fetching cache...');
                // We'll reuse the /setup/cache endpoint if it exists or add a new one. 
                // For now, let's assume we can hit the same endpoint used by the scraper logic or similar.
                // Wait, the user asked for "view existing cache". The backend likely has a way to read setup.json.
                // I'll check /api/setup/cache locally. If not, I'll add the endpoint or just read the file if I was on backend.
                // Since this is CLI talking to backend, I should hit an endpoint.

                // Let's try hitting a new endpoint we will create: /admin/cache
                const res = await fetchWithTimeout(`${adminUrl}/cache`);
                const cache = await res.json();

                logger.info('\n\x1b[32m--- Current Setup Cache ---\x1b[0m');
                if (!cache || Object.keys(cache).length === 0) {
                    logger.info('Cache is empty.');
                } else {
                    const currentWorld = cache.currentWorldId ? cache.worlds[cache.currentWorldId] : null;
                    logger.info(`Current World ID: ${cache.currentWorldId || 'None'}`);
                    if (currentWorld) {
                        logger.info(`Last Scrape: ${new Date(currentWorld.lastUpdated).toLocaleString()}`);
                    }

                    logger.info(`\nCached Worlds:`);
                    if (cache.worlds) {
                        for (const [id, data] of Object.entries(cache.worlds) as any) {
                            logger.info(` - ${data.worldTitle} [${id}]`);
                            logger.info(`   (System: ${data.systemId})`);
                            logger.info(`   (Users: ${data.users?.length || 0})`);
                            logger.info(`   (Updated: ${new Date(data.lastUpdated).toLocaleString()})`);
                        }
                    }
                }
                logger.info('');
            }
        },
        {
            key: '?',
            label: 'Help',
            description: 'Show this list of commands',
            action: () => { }
        },
        {
            key: 'e',
            label: 'Exit',
            description: 'Close the Admin CLI',
            action: () => {
                logger.info('Goodbye!');
                process.exit(0);
            }
        }
    ];

    async function fetchWithTimeout(url: string, options: any = {}, timeout = 5000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            }
            return response;
        } catch (error: any) {
            clearTimeout(id);
            if (error.name === 'AbortError') throw new Error('Request timed out. Is the Core Service busy?');
            if (error.code === 'ECONNREFUSED') throw new Error(`Could not connect to Core Service at ${adminUrl}. Is it running?`);
            throw error;
        }
    }

    async function getFilteredCommands() {
        try {
            const res = await fetchWithTimeout(`${adminUrl}/status`, {}, 2000);
            const status = await res.json();
            const isSetup = status.worldState === 'setup';

            // Define visibility rules
            return commands.filter(cmd => {
                // Always show accessible commands
                if (['v', 'l', '?', 'e', 'i'].includes(cmd.key)) return true; // Added 'i' as always accessible

                if (isSetup) {
                    // In Setup: Show Start (s). Hide Shutdown (h), Configure (c).
                    return ['s'].includes(cmd.key); // Removed 'd'
                } else {
                    // In Active: Show Shutdown (h), Configure (c). Hide Start (s).
                    return ['h', 'c'].includes(cmd.key); // Removed 'd'
                }
            });
        } catch (e) {
            // If offline/error, show minimal commands + Import
            return commands.filter(cmd => ['v', '?', 'e', 'i'].includes(cmd.key));
        }
    }

    // Initial Header
    // logger.info('\x1b[36m%s\x1b[0m', '--- SheetDelver Admin CLI ---');
    // logger.info(`Connecting to Core Service at: ${adminUrl}\n`);

    while (true) {
        // Refresh available commands based on state
        const availableCommands = await getFilteredCommands();

        // Helper to show menu
        const showMenu = () => {
            logger.info('\n\x1b[36mAvailable Commands:\x1b[0m');
            availableCommands.forEach(cmd => {
                logger.info(`  \x1b[33m[${cmd.key.toUpperCase()}]\x1b[0m ${cmd.label.padEnd(25)} - ${cmd.description}`);
            });
            logger.info('');
        };

        // Show menu on start or after invalid input? 
        // Better: Show concise prompt, user can type '?' for menu.
        // Actually, for a nice CLI, showing the valid options on state change is good.
        // Let's just show it every loop for clarity, or only when '?' is typed?
        // The user experience "Adjust the CLI menu" implies they want to see the options.
        // Let's show it if it's the first run or if requested.

        // Simple approach: Always show menu before prompt like before, but filtered.
        showMenu();

        const { input } = await inquirer.prompt([
            {
                type: 'input',
                name: 'input',
                message: 'Admin>',
                prefix: ''
            }
        ]);

        const normalizedInput = input.trim().toLowerCase();
        if (!normalizedInput) continue;

        const cmd = availableCommands.find(c =>
            c.key.toLowerCase() === normalizedInput ||
            c.label.toLowerCase() === normalizedInput ||
            c.label.toLowerCase().startsWith(normalizedInput)
        );

        if (cmd) {
            try {
                await cmd.action();
            } catch (e: any) {
                logger.error(`\n\x1b[31mError:\x1b[0m ${e.message}\n`);
                logger.info('\x1b[34mTip:\x1b[0m Ensure "npm run dev" or "npm run core" is running.\n');
            }
        } else {
            logger.info(`\n\x1b[31mUnknown or unavailable command:\x1b[0m "${input}". Type \x1b[33m[?]\x1b[0m for help.\n`);
        }

        // Small pause to let user read output
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

main().catch(err => {
    logger.error('Fatal CLI Error:', err);
    process.exit(1);
});
