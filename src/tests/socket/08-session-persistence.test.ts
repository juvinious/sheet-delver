
import { SessionManager } from '../../core/session/SessionManager';
import { loadConfig } from '../../core/config';
import { logger } from '../../core/logger';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function testSessionPersistence() {
    console.log('🧪 Test 8: Session Persistence and Restoration\n');

    const config = await loadConfig();
    if (!config) {
        throw new Error('Failed to load configuration');
    }

    const sessionManager = new SessionManager(config.foundry);

    try {
        console.log('8a. Initializing SessionManager (connecting system socket)...');
        await sessionManager.initialize();

        const username = await ask('Enter Foundry Username: ');
        const password = await ask('Enter Foundry Password: ');

        console.log(`\n8b. Creating session for "${username}"...`);
        const { sessionId, userId } = await sessionManager.createSession(username, password);

        console.log(`✅ Session created. ID: ${sessionId}, UserID: ${userId}`);

        const session = await sessionManager.getOrRestoreSession(sessionId);
        if (!session) throw new Error('Session not found after creation');

        console.log('8c. Verifying data fetch (Actors)...');
        const actors = await session.client.getActors();
        console.log(`   ✅ Fetched ${actors.length} actors.`);

        console.log('\n8d. Simulating Server Restart (clearing in-memory sessions)...');
        // @ts-ignore - reaching into private map for testing
        sessionManager.sessions.clear();

        console.log('8e. Attempting to restore session from disk...');
        const restoredSession = await sessionManager.getOrRestoreSession(sessionId);

        if (restoredSession) {
            console.log('   ✅ Session restored successfully.');

            console.log('8f. Verifying data fetch with restored session...');
            const restoredActors = await restoredSession.client.getActors();
            console.log(`   ✅ Fetched ${restoredActors.length} actors with restored session.`);

            if (restoredActors.length === actors.length) {
                console.log('   ✅ Actor count matches.');
            } else {
                console.warn('   ⚠️ Actor count mismatch (might be expected if world changed).');
            }
        } else {
            throw new Error('Failed to restore session from disk');
        }

        console.log('\n📊 Test Passed');
        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

testSessionPersistence();
