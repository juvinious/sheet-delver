import { strict as assert } from 'node:assert';
import { redactSourceProfile } from '@modules/registry/distribution/sourceProfiles';
import { ModuleSourceKind } from '@shared/types/modules';
import type { SourceProfile } from '@modules/registry/distribution/sourceProfiles';

function makeProfile(overrides: Partial<SourceProfile> = {}): SourceProfile {
    return {
        id: 'src_test',
        name: 'Test Source',
        kind: ModuleSourceKind.Indexed,
        baseUrl: 'https://registry.example.com',
        enabled: true,
        priority: 10,
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

async function runSourceProfileRedactionTests(): Promise<void> {
    console.log('Running source-profile response tests...');

    const profile = makeProfile();
    const response = redactSourceProfile(profile);
    assert.equal(response, profile, 'public profiles pass through the response boundary');
    assert.equal('auth' in response, false, 'public source profiles have no auth field');
    assert.equal('hostAllowlist' in response, false, 'host policy is configured globally');
    assert.equal(response.baseUrl, 'https://registry.example.com', 'public fields are preserved');

    console.log('  All source-profile response tests passed!');
}

export function run(): Promise<void> {
    return runSourceProfileRedactionTests();
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run()
        .then(() => console.log('source-profile-redaction.test.ts passed'))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
