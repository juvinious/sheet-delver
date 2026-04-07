
// UserKey Probe Script
// Location: src/test/socket/UserKeyProbe.ts
// Usage: npx tsx src/test/socket/UserKeyProbe.ts


const fetch = global.fetch;

import { loadConfig } from '@core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';
const USERNAME = config?.foundry.username || 'Gamemaster';
const PASSWORD = process.env.FOUNDRY_PASSWORD || 'password';

async function probeLogin() {
    logger.info(`[PROBE] Starting UserKey Probe for user "${USERNAME}"...`);

    // 1. Fetch /join to get cookies
    const joinRes = await fetch(`${BASE_URL}/join`);
    const setCookie = joinRes.headers.get('set-cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : '';
    logger.info(`[PROBE] Cookie: ${cookie}`);

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
        logger.info(`\n--- Testing: ${t.name} (Form URL Encoded + Cookie) ---`);
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

            logger.info(`Status: ${res.status}`);
            const text = await res.text();
            if (res.status === 401 && text.includes("ErrorUserDoesNotExist")) {
                logger.info("RESULT: FAILED (User Lookup Failed)");
            } else if (res.status === 401 && text.includes("ErrorInvalidPassword")) {
                logger.info("RESULT: SUCCESS!! (User Found, Password Wrong)");
            } else if (res.status === 302) {
                logger.info("RESULT: SUCCESS (Redirect)");
            } else {
                logger.info(`RESULT: Other (${res.status})`);
                logger.info(text.substring(0, 100));
            }

        } catch (e: any) {
            logger.error("Exception:", e.message);
        }
    }
}

probeLogin();
