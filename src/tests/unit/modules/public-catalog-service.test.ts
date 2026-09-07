import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    __resetDataDirForTests,
    getDataDir,
    initDataDir,
} from '@core/paths';
import {
    __resetPublicCatalogCacheForTests,
    aggregatePublicCatalogs,
    fetchPublicCatalog,
    PUBLIC_CATALOG_CACHE_TTL_MS,
} from '@modules/registry/distribution/publicCatalogService';
import { MODULE_INDEX_SCHEMA_VERSION, type ModuleIndexDocument } from '@modules/registry/moduleIndex';
import {
    ModuleSourceKind,
    ModuleTrustTier,
    type ModuleTrustTier as ModuleTrustTierValue,
} from '@shared/types/modules';
import type { SourceProfile } from '@modules/registry/distribution/sourceProfiles';

function profile(
    id: string,
    priority: number,
    trustTier: ModuleTrustTierValue = ModuleTrustTier.Unverified,
): SourceProfile {
    return {
        id,
        name: id,
        kind: ModuleSourceKind.Indexed,
        baseUrl: `https://${id}.example/catalog.json`,
        enabled: true,
        priority,
        trustTier,
        createdAt: 0,
        updatedAt: 0,
    };
}

function catalog(publisher: string, title: string): ModuleIndexDocument {
    return {
        schemaVersion: MODULE_INDEX_SCHEMA_VERSION,
        generatedAt: 1,
        publisher,
        modules: {
            shared: {
                moduleId: 'shared',
                title,
                repository: `https://github.com/${publisher}/shared`,
                manifest: `https://github.com/${publisher}/shared/releases/latest/download/sheet-delver-manifest.json`,
            },
        },
    };
}

function dependencies(index: ModuleIndexDocument, calls: { count: number }) {
    return {
        resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 as const }],
        requestHop: async () => {
            calls.count += 1;
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: Buffer.from(JSON.stringify(index)),
            };
        },
        sleep: async () => undefined,
    };
}

export async function run() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-delver-public-catalog-'));
    let previousDataDir: string | null = null;
    try {
        try { previousDataDir = getDataDir(); } catch { /* paths were not initialized */ }
        initDataDir(tempRoot);
        __resetPublicCatalogCacheForTests();

        const primary = profile('primary', 10, ModuleTrustTier.FirstParty);
        const primaryCatalog = catalog('primary', 'Primary Shared');
        const calls = { count: 0 };
        const first = await fetchPublicCatalog(primary, {
            allowedHosts: ['primary.example'],
            retries: 0,
        }, {
            now: () => 1000,
            dependencies: dependencies(primaryCatalog, calls),
        });
        assert.equal(first.state, 'fresh');
        assert.equal(calls.count, 1);

        const cached = await fetchPublicCatalog(primary, {
            allowedHosts: ['primary.example'],
            retries: 0,
        }, {
            now: () => 1000 + PUBLIC_CATALOG_CACHE_TTL_MS - 1,
            dependencies: dependencies(primaryCatalog, calls),
        });
        assert.equal(cached.state, 'cached');
        assert.equal(calls.count, 1);

        const stale = await fetchPublicCatalog(primary, {
            allowedHosts: ['primary.example'],
            retries: 0,
        }, {
            forceRefresh: true,
            now: () => 2000,
            dependencies: {
                resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
                requestHop: async () => { throw new Error('catalog offline'); },
                sleep: async () => undefined,
            },
        });
        assert.equal(stale.state, 'stale');
        assert.equal(stale.index?.modules.shared.title, 'Primary Shared');
        assert.match(stale.error || '', /catalog offline/);

        const missing = await fetchPublicCatalog(profile('missing', 30), {
            allowedHosts: ['missing.example'],
            retries: 0,
        }, {
            dependencies: {
                resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
                requestHop: async () => { throw new Error('catalog missing'); },
                sleep: async () => undefined,
            },
        });
        assert.equal(missing.state, 'error');
        assert.equal(missing.index, undefined);

        const secondary = profile('secondary', 20);
        const aggregate = await aggregatePublicCatalogs(
            [secondary, primary],
            { allowedHosts: ['primary.example', 'secondary.example'], retries: 0 },
            {
                forceRefresh: true,
                dependencies: {
                    resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
                    requestHop: async (url) => ({
                        statusCode: 200,
                        headers: { 'content-type': 'application/json' },
                        body: Buffer.from(JSON.stringify(
                            url.hostname === 'primary.example'
                                ? primaryCatalog
                                : catalog('secondary', 'Secondary Shared'),
                        )),
                    }),
                    sleep: async () => undefined,
                },
            },
        );
        assert.equal(aggregate.modules.shared.entry.title, 'Primary Shared');
        assert.equal(aggregate.modules.shared.source.id, 'primary');
        assert.deepEqual(aggregate.modules.shared.alternatives.map((source) => source.id), ['secondary']);
        assert.deepEqual(aggregate.conflicts, [{
            moduleId: 'shared',
            selectedSourceId: 'primary',
            shadowedSourceIds: ['secondary'],
        }]);
    } finally {
        __resetPublicCatalogCacheForTests();
        __resetDataDirForTests(previousDataDir);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run()
        .then(() => console.log('public-catalog-service.test.ts passed'))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
