import { run as runStatusSanitize } from './status-sanitize.test';
import { run as runLocalhostPolicy } from './localhost-policy.test';

function runAllUnitTests() {
    runStatusSanitize();
    runLocalhostPolicy();
}

runAllUnitTests();
console.log('unit test suite passed');
