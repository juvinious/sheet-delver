#!/usr/bin/env tsx
/**
 * Socket Test Runner
 * Runs all socket tests in sequence and reports results
 */

import { testConnection } from './01-connection.test';
import { testSystemInfo } from './02-system-info.test';
import { testActorAccess } from './03-actor-access.test';
import { testUsersAndCompendia } from './04-users-compendia.test';
import { testWriteOperations } from './05-write-operations.test';
import { testAppLogin } from './06-app-login.test';
import { testRolling } from './09-rolling.test'; // Added rolling test import

async function runAllTests() {
    console.log('🚀 Socket Client Test Suite\n');
    console.log('='.repeat(60));

    const tests = [
        { name: 'Connection & Authentication', fn: testConnection },
        { name: 'System Information', fn: testSystemInfo },
        { name: 'Actor Data Access', fn: testActorAccess },
        { name: 'Users & Compendium Data', fn: testUsersAndCompendia },
        { name: 'Write Operations', fn: testWriteOperations },
        { name: 'App Login Verification', fn: testAppLogin },
        { name: 'Rolling Operations', fn: testRolling }
    ];

    const results: any[] = [];

    for (const test of tests) {
        console.log(`\n📋 Running: ${test.name}`);
        console.log('-'.repeat(60));

        try {
            const result = await test.fn();
            results.push({ name: test.name, ...result });
        } catch (error: any) {
            console.error(`❌ Test crashed: ${error.message}`);
            results.push({ name: test.name, success: false, error: error.message });
        }

        console.log('='.repeat(60));
    }

    // Final Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 FINAL TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    results.forEach(r => {
        const icon = r.success ? '✅' : '❌';
        console.log(`${icon} ${r.name}`);
        if (r.error) {
            console.log(`   Error: ${r.error}`);
        }
    });

    console.log('\n' + '-'.repeat(60));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(60) + '\n');

    process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
    console.error('❌ Test runner crashed:', error);
    process.exit(1);
});
