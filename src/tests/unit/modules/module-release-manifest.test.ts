import { strict as assert } from 'node:assert';
import {
    MODULE_RELEASE_MANIFEST_SCHEMA_VERSION,
    createModuleReleaseManifest,
    validateModuleReleaseManifest,
    type ModuleReleaseManifest,
} from '@modules/registry/releaseManifest';
import type { SystemModuleInfo } from '@modules/registry/types';

const INTEGRITY = `sha256:${'a'.repeat(64)}`;

function buildInfo(): SystemModuleInfo {
    return {
        id: 'shadowdark',
        title: 'Shadowdark RPG',
        version: '1.2.0',
        manifest: {
            ui: 'dist/ui.js',
            logic: 'dist/logic.js',
            server: 'dist/server.js',
        },
        compatibility: {
            coreVersion: '>=0.8.0 <1.0.0',
            apiContracts: {
                'module-api': '>=1.0.0 <2.0.0',
            },
        },
        trust: { tier: 'first-party' },
        permissions: {
            network: { outbound: false },
            adminRoutes: false,
        },
        dependencies: ['module-a'],
        conflicts: ['module-b'],
    };
}

function buildValidManifest(): ModuleReleaseManifest {
    return createModuleReleaseManifest(
        buildInfo(),
        {
            url: 'shadowdark-1.2.0.tgz',
            size: 4096,
            integrity: INTEGRITY,
        },
        {
            publishedAt: 1788739200000,
            repository: 'https://github.com/sheetdelver/sd-shadowdark',
            changelog: 'https://github.com/sheetdelver/sd-shadowdark/releases/tag/v1.2.0',
        },
    );
}

export function run() {
    const valid = buildValidManifest();
    assert.equal(valid.schemaVersion, MODULE_RELEASE_MANIFEST_SCHEMA_VERSION);
    assert.deepEqual(valid.module.compatibility, buildInfo().compatibility);
    assert.deepEqual(valid.module.permissions, buildInfo().permissions);
    assert.equal(Object.prototype.hasOwnProperty.call(valid.module, 'trust'), false);
    assert.deepEqual(validateModuleReleaseManifest(valid), { valid: true, errors: [] });

    const httpsArtifact: ModuleReleaseManifest = {
        ...valid,
        artifact: {
            ...valid.artifact,
            url: 'https://github.com/sheetdelver/sd-shadowdark/releases/download/v1.2.0/shadowdark-1.2.0.tgz',
        },
    };
    assert.equal(validateModuleReleaseManifest(httpsArtifact).valid, true);

    const invalidDigest: ModuleReleaseManifest = {
        ...valid,
        artifact: { ...valid.artifact, integrity: 'sha256:not-a-digest' },
    };
    assert.equal(
        validateModuleReleaseManifest(invalidDigest).errors.some((error) => error.includes('64 lowercase')),
        true,
    );

    const traversalArtifact: ModuleReleaseManifest = {
        ...valid,
        artifact: { ...valid.artifact, url: '../shadowdark.tgz' },
    };
    assert.equal(validateModuleReleaseManifest(traversalArtifact).valid, false);

    const selfAssertedTrust = {
        ...valid,
        module: { ...valid.module, trustTier: 'first-party' },
    };
    assert.equal(
        validateModuleReleaseManifest(selfAssertedTrust).errors.some((error) => error.includes('trust tier')),
        true,
    );

    const credentialsInUrl: ModuleReleaseManifest = {
        ...valid,
        repository: 'https://token@example.invalid/module',
    };
    assert.equal(validateModuleReleaseManifest(credentialsInUrl).valid, false);

    assert.throws(
        () => createModuleReleaseManifest(
            { ...buildInfo(), version: '../escape' },
            valid.artifact,
        ),
        /safe non-empty release version/,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        run();
        console.log('module-release-manifest.test.ts passed');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
