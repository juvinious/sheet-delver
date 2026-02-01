// Quick script to generate a setup token
// Usage: npx tsx generate-setup-token.ts

import { SetupToken } from './src/lib/security/SetupToken';

const token = SetupToken.generate();
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const setupUrl = `${appUrl}/setup?token=${token}`;

console.log('\n' + '='.repeat(80));
console.log('🔧 SETUP TOKEN GENERATED');
console.log('='.repeat(80));
console.log('Setup URL:');
console.log('');
console.log(setupUrl);
console.log('');
console.log('Token expires in 1 hour or after first use.');
console.log('='.repeat(80) + '\n');
