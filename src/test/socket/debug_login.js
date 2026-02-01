
import { loadConfig } from '../../lib/config.js';

const config = await loadConfig();
const BASE_URL = config?.foundry?.url || 'http://localhost:30000';

async function debugLogin() {
    console.log(`fetching ${BASE_URL}/join ...`);
    try {
        const response = await fetch(`${BASE_URL}/join`, {
            headers: { 'User-Agent': 'SheetDelver Debugger/1.0' }
        });
        const html = await response.text();

        console.log('--- LOOKING FOR INPUTS ---');
        // Foundry hidden user list uses an input for username
        const inputRegex = /<input[^>]*name="([^"]+)"[^>]*>/g;
        let match;
        while ((match = inputRegex.exec(html)) !== null) {
            console.log(`Found Input: Name="${match[1]}", Tag="${match[0]}"`);
        }

        // Also look for selects just in case
        console.log('--- LOOKING FOR SELECTS ---');
        const selectRegex = /<select[^>]*name="([^"]+)"[^>]*>/g;
        while ((match = selectRegex.exec(html)) !== null) {
            console.log(`Found Select: Name="${match[1]}", Tag="${match[0]}"`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

debugLogin();
