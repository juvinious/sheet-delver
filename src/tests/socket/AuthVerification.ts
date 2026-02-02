export { };

// Authentication Verification Script
// Location: src/test/socket/AuthVerification.ts
// Usage: npx tsx src/test/socket/AuthVerification.ts
// Purpose: Verifies that the client can fetch the /join page, extract the CSRF token, and parse visible users (if any).
// This logic mimics the updated SocketClient.ts to ensure parsing regexes are correct on the live server.





import { loadConfig } from '../../core/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';
const TARGET_USERNAME = config?.foundry.username || 'Gamemaster';

async function verifyAuthParsing() {
    console.log(`[VERIFY] Fetching ${BASE_URL}/join ...`);
    try {
        const response = await fetch(`${BASE_URL}/join`, {
            headers: {
                'User-Agent': 'SheetDelver Verification/1.0'
            }
        });

        if (!response.ok) {
            console.error(`[FAIL] HTTP Error: ${response.status} ${response.statusText}`);
            return;
        }

        const html = await response.text();
        console.log(`[SUCCESS] Fetched ${html.length} bytes.`);

        // 1. Verify CSRF Token Extraction
        console.log('[VERIFY] Checking for CSRF Token...');
        const csrfMatch = html.match(/name="csrf-token" content="(.*?)"/) || html.match(/input type="hidden" name="csrf" value="(.*?)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : null;

        if (csrfToken) {
            console.log(`[PASS] Found CSRF Token: ${csrfToken.substring(0, 15)}...`);
        } else {
            console.error('[FAIL] Could not find CSRF Token! Login attempts will likely fail 401/403.');
            const headMatch = html.indexOf('<head>');
            const headEndMatch = html.indexOf('</head>');
            if (headMatch !== -1 && headEndMatch !== -1) {
                console.log('HTML Preview of head:', html.substring(headMatch, Math.min(headEndMatch + 7, headMatch + 500)));
            }
        }

        // 2. Verify User ID Discovery (Hidden vs Visible)
        console.log(`[VERIFY] Checking visibility of user "${TARGET_USERNAME}"...`);

        // Check for visible option
        const visibleMatch = html.match(new RegExp(`option value="([^"]+)">[^<]*${TARGET_USERNAME}`, 'i'));
        // Check for JSON/Object definition
        const jsonMatch = html.match(new RegExp(`"id":"([^"]+)"[^{}]*"name":"${TARGET_USERNAME}"`, 'i'));

        if (visibleMatch) {
            console.log(`[INFO] User list is VISIBLE. Found ID: ${visibleMatch[1]}`);
        } else if (jsonMatch) {
            console.log(`[INFO] User found in JSON data. Found ID: ${jsonMatch[1]}`);
        } else {
            console.log(`[INFO] User "${TARGET_USERNAME}" NOT found in HTML. User list is likely HIDDEN.`);
            console.log(`[PASS] Client should fallback to using username "${TARGET_USERNAME}" as ID.`);
        }

    } catch (e: any) {
        console.error("[FAIL] Execution Error:", e.message);
    }
}

verifyAuthParsing();
