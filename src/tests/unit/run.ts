import { run as runStatusSanitize } from './status-sanitize.test';
import { run as runLocalhostPolicy } from './localhost-policy.test';
import { run as runRealtimeBroadcaster } from './realtime-broadcaster.test';
import { run as runAppSocketGateway } from './app-socket-gateway.test';

async function runAllUnitTests() {
    runStatusSanitize();
    runLocalhostPolicy();
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
