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
import { run as runModuleLifecycleState } from './module-lifecycle-state.test';
import { run as runModuleManifestValidation } from './module-manifest-validation.test';
import { run as runModuleRegistryManager } from './module-registry-manager.test';

async function runAllUnitTests() {
    runStatusSanitize();
    runLocalhostPolicy();
    await runAuthStatusSmoke();
    await runActorCombatSmoke();
    runCombatSort();
    runModuleProxyMatcher();
    runModuleLifecycleState();
    runModuleManifestValidation();
    await runModuleRegistryManager();
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
