
// JSON Discovery Probe
// Location: src/test/socket/JsonDiscoveryProbe.ts
// Usage: npx tsx src/test/socket/JsonDiscoveryProbe.ts

import { loadConfig } from '@core/config';
import { logger } from '@shared/utils/logger';

const config = await loadConfig();
const BASE_URL = config?.foundry.url || 'http://localhost:30000';

async function probe() {
    logger.info(`[PROBE] Fetching ${BASE_URL}/join ...`);
    const res = await fetch(`${BASE_URL}/join`);
    const html = await res.text();

    logger.info(`[PROBE] HTML Length: ${html.length}`);

    logger.info(`[PROBE] Dumping HTML:\n${html}`);

}

probe();
