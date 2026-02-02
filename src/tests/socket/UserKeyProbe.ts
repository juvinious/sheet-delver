
// UserKey Probe Script
// Location: src/test/socket/UserKeyProbe.ts
// Usage: npx tsx src/test/socket/UserKeyProbe.ts


const fetch = global.fetch;

import { loadConfig } from '../../core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';
const USERNAME = config?.foundry.username || 'Gamemaster';
const PASSWORD = process.env.FOUNDRY_PASSWORD || 'password';

async function probeLogin() {
    console.log(`[PROBE] Starting UserKey Probe for user "${USERNAME}"...`);

    // 1. Fetch /join to get cookies
    const joinRes = await fetch(`${BASE_URL}/join`);
    const setCookie = joinRes.headers.get('set-cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : '';
    console.log(`[PROBE] Cookie: ${cookie}`);

    // 2. Prepare payload
    // User requested specifically to try "username for login under userid"
    const params = new URLSearchParams();
    params.append('userid', USERNAME);
    params.append('password', PASSWORD);
    params.append('action', 'join');

    // Also try camelCase 'userId' just in case
    const paramsCamel = new URLSearchParams();
    paramsCamel.append('userId', USERNAME);
    paramsCamel.append('password', PASSWORD);
    paramsCamel.append('action', 'join');

    const tests = [
        { name: 'userid=Gamemaster', body: params },
        { name: 'userId=Gamemaster', body: paramsCamel }
    ];

    for (const t of tests) {
        console.log(`\n--- Testing: ${t.name} (Form URL Encoded + Cookie) ---`);
        try {
            const res = await fetch(`${BASE_URL}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'ModalSheetDelver/1.0',
                    'Referer': `${BASE_URL}/join`,
                    'Origin': BASE_URL,
                    'Cookie': cookie
                },
                body: t.body.toString(),
                redirect: 'manual'
            });

            console.log(`Status: ${res.status}`);
            const text = await res.text();
            if (res.status === 401 && text.includes("ErrorUserDoesNotExist")) {
                console.log("RESULT: FAILED (User Lookup Failed)");
            } else if (res.status === 401 && text.includes("ErrorInvalidPassword")) {
                console.log("RESULT: SUCCESS!! (User Found, Password Wrong)");
            } else if (res.status === 302) {
                console.log("RESULT: SUCCESS (Redirect)");
            } else {
                console.log(`RESULT: Other (${res.status})`);
                console.log(text.substring(0, 100));
            }

        } catch (e: any) {
            console.error("Exception:", e.message);
        }
    }
}

probeLogin();
