import { run as runStatusSanitize } from './status-sanitize.test';
import { run as runLocalhostPolicy } from './localhost-policy.test';
import { run as runRealtimeBroadcaster } from './realtime-broadcaster.test';
import { run as runAppSocketGateway } from './app-socket-gateway.test';
import { run as runAuthStatusSmoke } from './auth-status-smoke.test';
import { run as runActorCombatSmoke } from './actor-combat-smoke.test';
import { run as runCombatSort } from './combat-sort.test';
import { run as runActorNormalization } from './actor-normalization.test';
import { run as runJournalSmoke } from './journal-smoke.test';
import { run as runModuleProxyMatcher } from './module-proxy-matcher.test';

async function runAllUnitTests() {
    runStatusSanitize();
    runLocalhostPolicy();
    await runAuthStatusSmoke();
    await runActorCombatSmoke();
    runCombatSort();
    runModuleProxyMatcher();
    await runActorNormalization();
    await runJournalSmoke();
    await runRealtimeBroadcaster();
    await runAppSocketGateway();
}

runAllUnitTests()
    .then(() => {
        console.log('unit test suite passed');
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
