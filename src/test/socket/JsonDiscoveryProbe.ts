
// JSON Discovery Probe
// Location: src/test/socket/JsonDiscoveryProbe.ts
// Usage: npx tsx src/test/socket/JsonDiscoveryProbe.ts

import { loadConfig } from '../../lib/config';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probe() {
    console.log(`[PROBE] Fetching ${BASE_URL}/join ...`);
    const res = await fetch(`${BASE_URL}/join`);
    const html = await res.text();

    console.log(`[PROBE] HTML Length: ${html.length}`);

    console.log(`[PROBE] Dumping HTML:\n${html}`);

}

probe();
