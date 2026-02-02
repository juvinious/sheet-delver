
import inquirer from 'inquirer';
import { loadConfig } from '@/core/config';

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
    const config = await loadConfig();
    if (!config) {
        console.error('\x1b[31mError:\x1b[0m Failed to load config.');
        process.exit(1);
    }

    const adminUrl = `http://127.0.0.1:${config.app.port + 1}/admin`;

    console.log('\x1b[36m%s\x1b[0m', '--- SheetDelver Admin CLI ---');
    console.log(`Connecting to Core Service at: ${adminUrl}\n`);

    const commands: Command[] = [
        {
            key: 'v',
            label: 'View Status',
            description: 'Check connectivity and world state',
            action: async () => {
                const res = await fetchWithTimeout(`${adminUrl}/status`);
                console.log('\n\x1b[32m--- Core Service Status ---\x1b[0m');
                console.table(await res.json());
            }
        },
        {
            key: 'd',
            label: 'Discover/List Worlds',
            description: 'Scrape and list available Foundry worlds',
            action: async () => {
                console.log('Scraping worlds...');
                const res = await fetchWithTimeout(`${adminUrl}/worlds`);
                const worlds = await res.json();
                if (worlds.length === 0) {
                    console.log('\x1b[33mNo worlds discovered.\x1b[0m (Try refreshing or verify setup page access)');
                } else {
                    console.table(worlds.map((w: any) => ({
                        id: w.worldId || w.id,
                        title: w.worldTitle || w.title,
                        system: w.systemId || w.system
                    })));
                }
            }
        },
        {
            key: 's',
            label: 'Start World',
            description: 'Launch a specific Foundry world',
            action: async () => {
                const wRes = await fetchWithTimeout(`${adminUrl}/worlds`);
                const ws = await wRes.json();
                if (ws.length === 0) {
                    console.log('\x1b[33mNo worlds available to start.\x1b[0m');
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
                console.log(await launchRes.json());
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
                    console.log(await res.json());
                }
            }
        },
        {
            key: 'c',
            label: 'Configure/Setup',
            description: 'Run initial setup by scraping world data',
            action: async () => {
                const { token } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'token',
                        message: 'Paste your session cookie (e.g., "session=s%3A..."):',
                        validate: (input) => input.trim().length > 10 || 'Cookie too short to be valid'
                    }
                ]);

                console.log('Running setup scrape...');
                const res = await fetchWithTimeout(`${adminUrl}/setup/scrape`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionCookie: token.trim() })
                });

                const result = await res.json();
                console.log('\n\x1b[32mSetup Successful!\x1b[0m');
                console.log(`World: ${result.data.worldTitle} (${result.data.worldId})`);
                console.log(`System: ${result.data.systemId}`);
                console.log(`Users: ${result.data.users.length} discovered`);
                console.log(`\n\x1b[33mConfiguration saved. You can now restart the Core Service to apply changes.\x1b[0m\n`);
            }
        },
        {
            key: 'l',
            label: 'List Cache',
            description: 'View current cached configuration',
            action: async () => {
                console.log('Fetching cache...');
                // We'll reuse the /setup/cache endpoint if it exists or add a new one. 
                // For now, let's assume we can hit the same endpoint used by the scraper logic or similar.
                // Wait, the user asked for "view existing cache". The backend likely has a way to read setup.json.
                // I'll check /api/setup/cache locally. If not, I'll add the endpoint or just read the file if I was on backend.
                // Since this is CLI talking to backend, I should hit an endpoint.

                // Let's try hitting a new endpoint we will create: /admin/cache
                const res = await fetchWithTimeout(`${adminUrl}/cache`);
                const cache = await res.json();

                console.log('\n\x1b[32m--- Current Setup Cache ---\x1b[0m');
                if (!cache || Object.keys(cache).length === 0) {
                    console.log('Cache is empty.');
                } else {
                    const currentWorld = cache.currentWorldId ? cache.worlds[cache.currentWorldId] : null;
                    console.log(`Current World ID: ${cache.currentWorldId || 'None'}`);
                    if (currentWorld) {
                        console.log(`Last Scrape: ${new Date(currentWorld.lastUpdated).toLocaleString()}`);
                    }

                    console.log(`\nCached Worlds:`);
                    if (cache.worlds) {
                        for (const [id, data] of Object.entries(cache.worlds) as any) {
                            console.log(` - ${data.worldTitle} [${id}]`);
                            console.log(`   (System: ${data.systemId})`);
                            console.log(`   (Users: ${data.users?.length || 0})`);
                            console.log(`   (Updated: ${new Date(data.lastUpdated).toLocaleString()})`);
                        }
                    }
                }
                console.log('');
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
                console.log('Goodbye!');
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
                if (['v', 'l', '?', 'e'].includes(cmd.key)) return true;

                if (isSetup) {
                    // In Setup: Show Discover (d), Start (s). Hide Shutdown (h), Configure (c).
                    return ['d', 's'].includes(cmd.key);
                } else {
                    // In Active: Show Shutdown (h), Configure (c). Hide Discover (d), Start (s).
                    return ['h', 'c'].includes(cmd.key);
                }
            });
        } catch (e) {
            // If offline/error, show minimal commands
            return commands.filter(cmd => ['v', '?', 'e'].includes(cmd.key));
        }
    }

    // Initial Header
    // console.log('\x1b[36m%s\x1b[0m', '--- SheetDelver Admin CLI ---');
    // console.log(`Connecting to Core Service at: ${adminUrl}\n`);

    while (true) {
        // Refresh available commands based on state
        const availableCommands = await getFilteredCommands();

        // Helper to show menu
        const showMenu = () => {
            console.log('\n\x1b[36mAvailable Commands:\x1b[0m');
            availableCommands.forEach(cmd => {
                console.log(`  \x1b[33m[${cmd.key.toUpperCase()}]\x1b[0m ${cmd.label.padEnd(25)} - ${cmd.description}`);
            });
            console.log('');
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
                console.error(`\n\x1b[31mError:\x1b[0m ${e.message}\n`);
                console.log('\x1b[34mTip:\x1b[0m Ensure "npm run dev" or "npm run core" is running.\n');
            }
        } else {
            console.log(`\n\x1b[31mUnknown or unavailable command:\x1b[0m "${input}". Type \x1b[33m[?]\x1b[0m for help.\n`);
        }

        // Small pause to let user read output
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

main().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
});
