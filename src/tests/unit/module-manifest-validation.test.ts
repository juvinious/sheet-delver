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
