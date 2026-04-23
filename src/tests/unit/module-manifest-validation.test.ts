import { strict as assert } from 'node:assert';
import { evaluateModuleCompatibility, validateModuleInfoShape } from '@modules/registry/validation';
import type { SystemModuleInfo } from '@modules/registry/types';

export function run() {
    const validManifest: SystemModuleInfo = {
        id: 'shadowdark',
        title: 'Shadowdark RPG',
        manifest: {
            ui: 'src/ui/index.tsx',
            logic: 'src/server/ShadowdarkAdapter.ts',
            server: 'module/server'
        }
    };

    const validResult = validateModuleInfoShape(validManifest);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.errors.length, 0);

    const invalidResult = validateModuleInfoShape({
        id: 'broken',
        title: 'Broken Module',
        manifest: {
            ui: 'module/ui'
        }
    });
    assert.equal(invalidResult.valid, false);
    assert.equal(invalidResult.errors.some((error) => error.includes('manifest.logic')), true);

    const compatible = evaluateModuleCompatibility({
        ...validManifest,
        compatibility: { coreVersion: '>=0.7.0 <1.0.0' }
    }, '0.7.0');
    assert.equal(compatible.compatible, true);

    const incompatible = evaluateModuleCompatibility({
        ...validManifest,
        compatibility: { coreVersion: '>=0.8.0 <1.0.0' }
    }, '0.7.0');
    assert.equal(incompatible.compatible, false);
    assert.equal(incompatible.reason?.includes('does not satisfy constraint'), true);

    const malformedConstraint = evaluateModuleCompatibility({
        ...validManifest,
        compatibility: { coreVersion: '^0.7.0' }
    }, '0.7.0');
    assert.equal(malformedConstraint.compatible, false);
    assert.equal(malformedConstraint.reason?.includes('Unsupported version constraint token'), true);

    const trustManifest: SystemModuleInfo = {
        ...validManifest,
        trust: { tier: 'verified-third-party' },
    };
    const trustResult = validateModuleInfoShape(trustManifest);
    assert.equal(trustResult.valid, true);

    const invalidTrustResult = validateModuleInfoShape({
        ...validManifest,
        trust: { tier: 'unknown-tier' }
    });
    assert.equal(invalidTrustResult.valid, false);
    assert.equal(
        invalidTrustResult.errors.some((error) => error.includes('trust.tier')),
        true
    );

    const permissionsResult = validateModuleInfoShape({
        ...validManifest,
        permissions: {
            network: {
                outbound: true,
                allowHosts: ['api.example.com'],
            },
            filesystem: {
                read: ['moduleData'],
                write: ['moduleData'],
            },
            adminRoutes: false,
            sensitiveData: ['actor'],
        },
    });
    assert.equal(permissionsResult.valid, true);

    const invalidPermissionsResult = validateModuleInfoShape({
        ...validManifest,
        permissions: {
            network: {
                outbound: 'yes',
            },
        },
    });
    assert.equal(invalidPermissionsResult.valid, false);
    assert.equal(
        invalidPermissionsResult.errors.some((error) => error.includes('permissions.network.outbound')),
        true
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        run();
        console.log('module-manifest-validation.test.ts passed');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}
