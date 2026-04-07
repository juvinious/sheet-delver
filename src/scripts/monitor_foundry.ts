import { FoundryClient } from '../lib/foundry/client';
import { loadConfig } from '../lib/config';

async function monitor() {
    logger.info('Loading config...');
    const config = await loadConfig();

    if (!config || !config.foundry.url) {
        logger.error('No Foundry URL configured in settings.yaml');
        process.exit(1);
    }

    logger.info(`Initializing FoundryClient for ${config.foundry.url}...`);
    const client = new FoundryClient({
        url: config.foundry.url,
        headless: true // Run headless to simulate backend behavior
    });

    try {
        await client.connect();
        logger.info('Connected. Starting monitoring loop (Ctrl+C to stop)...');
        logger.info('Please perform: Setup -> Start World -> Setup');

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
                    logger.info('------------------------------------------------');
                    logger.info(`[${state.time}] STATE SNAPSHOT:`);
                    logger.info(`  URL: ${state.url}`);
                    logger.info(`  Title: ${state.title}`);
                    logger.info(`  Game: ${state.hasGame} | Socket: ${state.socket} | Ready: ${state.ready}`);
                    logger.info(`  SystemID: ${state.systemId}`);
                    logger.info(`  WorldSystem: ${JSON.stringify(state.worldSystem)}`); // serialized
                    logger.info(`  WorldActive: ${state.worldActive}`);
                    logger.info(`  DOM: Setup=${state.domSetup}, Join=${state.domJoin}, Board=${state.domBoard}`);
                } else {
                    logger.info('State: null (Page might be navigating or closed)');
                }

            } catch (e: any) {
                logger.error('Error polling state:', e.message);
            }
        }, 2000); // Poll every 2 seconds

        // Keep script alive
        await new Promise(() => { });

    } catch (e) {
        logger.error('Fatal Error:', e);
        process.exit(1);
    }
}

monitor();
