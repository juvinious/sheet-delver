import { FoundryClient } from '../lib/foundry/client';
import { loadConfig } from '../lib/config';

async function monitor() {
    console.log('Loading config...');
    const config = await loadConfig();

    if (!config || !config.foundry.url) {
        console.error('No Foundry URL configured in settings.yaml');
        process.exit(1);
    }

    console.log(`Initializing FoundryClient for ${config.foundry.url}...`);
    const client = new FoundryClient({
        url: config.foundry.url,
        headless: true // Run headless to simulate backend behavior
    });

    try {
        await client.connect();
        console.log('Connected. Starting monitoring loop (Ctrl+C to stop)...');
        console.log('Please perform: Setup -> Start World -> Setup');

        setInterval(async () => {
            try {
                const state = await client.page?.evaluate(() => {
                    // @ts-ignore
                    const g = window.game;
                    return {
                        time: new Date().toISOString(),
                        url: window.location.href,
                        title: document.title,
                        hasGame: !!g,
                        // @ts-ignore
                        socket: g?.socket?.connected,
                        // @ts-ignore
                        ready: g?.ready,
                        // @ts-ignore
                        worldActive: g?.world?.active,
                        // @ts-ignore
                        systemId: g?.system?.id || g?.data?.system?.id,
                        // @ts-ignore
                        worldSystem: g?.world?.system, // The problematic field?
                        domSetup: !!document.getElementById('setup'),
                        domJoin: !!document.getElementById('join-game'),
                        domBoard: !!document.getElementById('board'),
                        domPaused: !!document.getElementById('pause'),
                    };
                });

                if (state) {
                    console.log('------------------------------------------------');
                    console.log(`[${state.time}] STATE SNAPSHOT:`);
                    console.log(`  URL: ${state.url}`);
                    console.log(`  Title: ${state.title}`);
                    console.log(`  Game: ${state.hasGame} | Socket: ${state.socket} | Ready: ${state.ready}`);
                    console.log(`  SystemID: ${state.systemId}`);
                    console.log(`  WorldSystem: ${JSON.stringify(state.worldSystem)}`); // serialized
                    console.log(`  WorldActive: ${state.worldActive}`);
                    console.log(`  DOM: Setup=${state.domSetup}, Join=${state.domJoin}, Board=${state.domBoard}`);
                } else {
                    console.log('State: null (Page might be navigating or closed)');
                }

            } catch (e: any) {
                console.error('Error polling state:', e.message);
            }
        }, 2000); // Poll every 2 seconds

        // Keep script alive
        await new Promise(() => { });

    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
}

monitor();
