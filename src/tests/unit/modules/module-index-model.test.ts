import { strict as assert } from 'node:assert';
import {
    MODULE_INDEX_SCHEMA_VERSION,
    resolveModuleIndexEntry,
    validateModuleIndexDocument,
    type ModuleIndexDocument,
} from '@modules/registry/moduleIndex';

function buildValidIndex(): ModuleIndexDocument {
    return {
        schemaVersion: MODULE_INDEX_SCHEMA_VERSION,
        generatedAt: Date.now(),
        publisher: 'sheetdelver',
        modules: {
            shadowdark: {
                moduleId: 'shadowdark',
                title: 'Shadowdark RPG',
                repository: 'https://github.com/sheetdelver/sd-shadowdark',
                manifest: 'https://github.com/sheetdelver/sd-shadowdark/releases/latest/download/sheet-delver-manifest.json',
                description: 'Shadowdark support for Sheet Delver',
                tags: ['fantasy', 'old-school'],
            },
        },
    };
}

export function run() {
    const valid = buildValidIndex();
    const validResult = validateModuleIndexDocument(valid);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.errors.length, 0);

    const invalidSchema = { ...buildValidIndex(), schemaVersion: 'module-index.v1' };
    const invalidSchemaResult = validateModuleIndexDocument(invalidSchema);
    assert.equal(invalidSchemaResult.valid, false);
    assert.equal(invalidSchemaResult.errors.some((error) => error.includes('schemaVersion')), true);

    const mismatchedId = buildValidIndex();
    mismatchedId.modules.shadowdark.moduleId = 'morkborg';
    const mismatchedIdResult = validateModuleIndexDocument(mismatchedId);
    assert.equal(mismatchedIdResult.valid, false);
    assert.equal(mismatchedIdResult.errors.some((error) => error.includes('must match')), true);

    const insecureManifest = buildValidIndex();
    insecureManifest.modules.shadowdark.manifest = 'http://example.invalid/manifest.json';
    const insecureManifestResult = validateModuleIndexDocument(insecureManifest);
    assert.equal(insecureManifestResult.valid, false);
    assert.equal(insecureManifestResult.errors.some((error) => error.includes('HTTPS URL')), true);

    const duplicateTags = buildValidIndex();
    duplicateTags.modules.shadowdark.tags = ['fantasy', 'fantasy'];
    const duplicateTagsResult = validateModuleIndexDocument(duplicateTags);
    assert.equal(duplicateTagsResult.valid, false);
    assert.equal(duplicateTagsResult.errors.some((error) => error.includes('duplicates')), true);

    const selfAssignedTrust = buildValidIndex() as ModuleIndexDocument & {
        modules: { shadowdark: ModuleIndexDocument['modules']['shadowdark'] & { trustTier: string } };
    };
    selfAssignedTrust.modules.shadowdark.trustTier = 'first-party';
    const selfAssignedTrustResult = validateModuleIndexDocument(selfAssignedTrust);
    assert.equal(selfAssignedTrustResult.valid, false);
    assert.equal(selfAssignedTrustResult.errors.some((error) => error.includes('local source policy')), true);

    const resolved = resolveModuleIndexEntry(valid, 'shadowdark');
    assert.equal(resolved.ok, true);
    assert.equal(resolved.value?.manifest.includes('sheet-delver-manifest.json'), true);

    const missingModule = resolveModuleIndexEntry(valid, 'missing-module');
    assert.equal(missingModule.ok, false);
    assert.equal(missingModule.error?.includes('was not found in index'), true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        run();
        console.log('module-index-model.test.ts passed');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
