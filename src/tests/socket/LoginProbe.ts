export { };

// Login Probe Script
// Location: src/test/socket/LoginProbe.ts
// Usage: npx tsx src/test/socket/LoginProbe.ts


const fetch = global.fetch;

import { loadConfig } from '../../core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';
const USERNAME = config?.foundry.username || 'Gamemaster';
const PASSWORD = config?.foundry.password || 'password';

async function probeLogin() {
    console.log(`[PROBE] Starting Final Login Probe for user "${USERNAME}"...`);

    const joinRes = await fetch(`${BASE_URL}/join`);
    const html = await joinRes.text();
    const csrfMatch = html.match(/name="csrf-token" content="(.*?)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    const permutations = [
        {
            name: "Key 'user' (Caps)",
            body: { user: USERNAME, password: PASSWORD, action: 'join' }
        },
        {
            name: "Key 'user' (Lower)",
            body: { user: USERNAME.toLowerCase(), password: PASSWORD, action: 'join' }
        },
        {
            name: "Admin Password attempt",
            body: { adminPassword: PASSWORD, action: 'join', password: PASSWORD }
        }
    ];

    for (const p of permutations) {
        console.log(`\n--- Testing: ${p.name} (Form URL Encoded) ---`);

        const params = new URLSearchParams();
        Object.entries(p.body).forEach(([k, v]) => {
            if (v !== null && v !== undefined) params.append(k, v as string);
        });

        if (csrfToken) {
            params.append('csrf-token', csrfToken);
            params.append('csrf', csrfToken);
        }

        try {
            const res = await fetch(`${BASE_URL}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'SheetDelver/1.0',
                    'Referer': `${BASE_URL}/join`,
                    'Origin': BASE_URL
                },
                body: params.toString(),
                redirect: 'manual'
            });

            console.log(`Status: ${res.status}`);
            const text = await res.text();
            if (res.status === 401 && text.includes("ErrorUserDoesNotExist")) {
                console.log("RESULT: FAILED (User Lookup Failed)");
            } else if (res.status === 401 && text.includes("ErrorInvalidPassword")) {
                console.log("RESULT: SUCCESS!! (User Found, Password Wrong)");
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
