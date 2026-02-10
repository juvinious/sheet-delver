
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { io } from 'socket.io-client';

// Helper to load settings
const loadSettings = () => {
    const settingsPath = path.resolve(process.cwd(), 'settings.yaml');
    const fileContents = fs.readFileSync(settingsPath, 'utf8');
    return yaml.load(fileContents) as any;
};

const config = loadSettings();
const foundryConfig = config.foundry;

console.log('--- Debug Login Flow ---');
console.log(`User: ${foundryConfig.username}`);

async function runtrace() {
    let baseUrl = foundryConfig.url;
    if (!baseUrl && foundryConfig.host) {
        baseUrl = `${foundryConfig.protocol || 'http'}://${foundryConfig.host}${foundryConfig.port ? `:${foundryConfig.port}` : ''}`;
    }

    if (!baseUrl) {
        console.error('Error: Foundry URL or Host not found in settings.yaml');
        process.exit(1);
    }

    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    console.log(`Target: ${baseUrl}`);

    // Cookie Jar
    const cookieMap = new Map<string, string>();
    const updateCookies = (headerVal: string | string[] | null | undefined) => {
        if (!headerVal) return;
        const cookies = Array.isArray(headerVal) ? headerVal : [headerVal];
        cookies.forEach(c => {
            const parts = c.split(/,(?=\s*\w+=)/g);
            parts.forEach(part => {
                const [pair] = part.split(';');
                if (pair.includes('=')) {
                    const [key, value] = pair.split('=');
                    cookieMap.set(key.trim(), value.trim());
                }
            });
        });
    };

    const getCookieString = () => Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // 1. GET /join
    console.log('\n[1] GET /join ...');
    const joinRes = await fetch(`${baseUrl}/join`, { headers: { 'User-Agent': 'SheetDelver/1.0' } });
    console.log(`Status: ${joinRes.status}`);
    updateCookies(joinRes.headers.get('set-cookie'));

    const html = await joinRes.text();
    let csrfToken: string | null = null;
    const csrfMatch = html.match(/csrfToken["']\s*:\s*["']([^"']+)["']/) || html.match(/name="csrf-token" content="(.*?)"/);
    if (csrfMatch) csrfToken = csrfMatch[1];
    console.log(`CSRF Extracted: ${csrfToken}`);

    // 2. Guest Socket Probe for User ID and World State
    console.log('\n[1.5] Guest Socket Probe for User ID and World State...');
    const guestCookie = getCookieString();

    let userId: string | null = null;
    let worldId: string | null = null;

    await new Promise<void>(resolve => {
        const guestSocket = io(baseUrl, {
            path: '/socket.io',
            transports: ['websocket'],
            reconnection: false,
            extraHeaders: { 'Cookie': guestCookie, 'User-Agent': 'SheetDelver/1.0' },
            transportOptions: { websocket: { extraHeaders: { 'Cookie': guestCookie } } }
        });

        guestSocket.on('connect', () => {
            console.log('Guest Socket Connected.');
            guestSocket.emit('getJoinData', (result: any) => {
                console.log('Guest getJoinData Result:', result ? 'Received' : 'Null');
                if (result && result.world) {
                    worldId = result.world.id;
                    console.log(`Discovered World: ${result.world.title} (${worldId})`);
                }
                if (result && result.users) {
                    const u = result.users.find((u: any) => u.name === foundryConfig.username);
                    if (u) {
                        userId = u._id;
                        console.log(`Found User ID for ${foundryConfig.username}: ${userId}`);
                    }
                }
                guestSocket.disconnect();
                resolve();
            });
        });
        guestSocket.on('connect_error', (err) => {
            console.error('Guest Socket Connect Error:', err.message);
            resolve();
        });
        setTimeout(() => {
            console.warn('Guest Socket Timeout');
            guestSocket.disconnect();
            resolve();
        }, 5000);
    });

    if (!userId) {
        userId = 'vsdS7qJdxmZS4ZAF'; // Hardcoded fallback for testing if probe fails
        console.warn(`Could not find User ID via Guest Mode. Using fallback: ${userId}`);
    }

    // 3. POST /join (Login)
    console.log('\n[2] POST /join (Login) ...');
    let finalCsrf = csrfToken || cookieMap.get('csrf-token') || cookieMap.get('xsrf-token') || null;

    const loginRes = await fetch(`${baseUrl}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': getCookieString(),
            'User-Agent': 'SheetDelver/1.0'
        },
        body: JSON.stringify({
            userid: userId,
            password: foundryConfig.password,
            action: 'join',
            'csrf-token': finalCsrf
        }),
        redirect: 'manual'
    });

    console.log(`Login Status: ${loginRes.status}`);
    const loginSetCookie = typeof (loginRes.headers as any).getSetCookie === 'function'
        ? (loginRes.headers as any).getSetCookie()
        : loginRes.headers.get('set-cookie');
    updateCookies(loginSetCookie);
    console.log(`Updated Cookie Jar: ${getCookieString()}`);

    if (loginRes.status === 200) {
        const text = await loginRes.text();
        console.log(`Login Body (200 OK): ${text.substring(0, 500)}`);
    }

    // 4. GET /game
    console.log('\n[3] GET /game ...');
    const gameRes = await fetch(`${baseUrl}/game`, {
        headers: {
            'Cookie': getCookieString(),
            'User-Agent': 'SheetDelver/1.0'
        },
        redirect: 'manual'
    });
    console.log(`Game Status: ${gameRes.status}`);
    if (gameRes.status === 302) {
        console.log(`Game Redirect Location: ${gameRes.headers.get('location')}`);
    } else {
        const gameHtml = await gameRes.text();
        const hasGameData = gameHtml.includes('const gameData');
        console.log(`Game HTML has gameData? ${hasGameData}`);
        console.log(`Game HTML Status: ${gameRes.status}`);
        console.log(`Game HTML Title: ${gameHtml.match(/<title>(.*?)<\/title>/)?.[1]}`);

        if (!hasGameData) {
            console.log('\n--- SEARCHING FOR gameData ---');
            const index = gameHtml.indexOf('gameData');
            if (index !== -1) {
                console.log(`Found 'gameData' at index ${index}. Snapshot around it:`);
                console.log(gameHtml.substring(index - 50, index + 500));
            } else {
                console.log("'gameData' not found anywhere in HTML.");
            }
        }
    }

    // 5. Authenticated Socket Probe
    console.log('\n[4] Authenticated Socket Probe...');
    const authSocket = io(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { 'Cookie': getCookieString(), 'User-Agent': 'SheetDelver/1.0' }
    });

    await new Promise<void>(resolve => {
        authSocket.on('connect', () => {
            console.log('Auth Socket Connected.');
            authSocket.emit('getJoinData', (result: any) => {
                console.log('Auth getJoinData Result:', result ? 'Received' : 'Null');
                if (result && result.world) {
                    console.log(`World State: ${result.world.title} (${result.world.id})`);
                }
                authSocket.disconnect();
                resolve();
            });
        });
        authSocket.on('connect_error', (err) => {
            console.error('Auth Socket Error:', err.message);
            resolve();
        });
        setTimeout(() => {
            console.warn('Auth Socket Probe Timeout');
            authSocket.disconnect();
            resolve();
        }, 5000);
    });

    console.log('\n--- Debug Complete ---');
    process.exit(0);
}

runtrace().catch(console.error);
