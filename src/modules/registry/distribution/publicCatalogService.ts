import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    ensureOwnerOnlyDirectorySync,
    getCacheDir,
    writeOwnerOnlyFileAtomicSync,
} from '@core/paths';
import {
    ModuleSourceKind,
    ModuleTrustTier,
    type ModuleTrustTier as ModuleTrustTierValue,
} from '@shared/types/modules';
import type { ModuleIndexDocument, ModuleIndexEntry } from './moduleIndex';
import { validateModuleIndexDocument } from './moduleIndex';
import {
    fetchPublicDistributionJson,
    type PublicDistributionDependencies,
    type PublicDistributionPolicy,
} from './publicDistributionClient';
import type { SourceProfile } from './sourceProfiles';

export const PUBLIC_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
export type PublicCatalogState = 'fresh' | 'cached' | 'stale' | 'error';

interface PersistedCatalogCacheEntry {
    fetchedAt: number;
    index: ModuleIndexDocument;
}

export interface PublicCatalogResult {
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    state: PublicCatalogState;
    fetchedAt?: number;
    index?: ModuleIndexDocument;
    error?: string;
}

export interface CatalogModuleSource {
    id: string;
    name: string;
    priority: number;
    trustTier: ModuleTrustTierValue;
}

export interface CatalogModuleListing {
    moduleId: string;
    entry: ModuleIndexEntry;
    source: CatalogModuleSource;
    alternatives: CatalogModuleSource[];
}

export interface CatalogModuleConflict {
    moduleId: string;
    selectedSourceId: string;
    shadowedSourceIds: string[];
}

export interface PublicCatalogAggregate {
    sources: PublicCatalogResult[];
    modules: Record<string, CatalogModuleListing>;
    conflicts: CatalogModuleConflict[];
}

export interface PublicCatalogFetchOptions {
    forceRefresh?: boolean;
    now?: () => number;
    dependencies?: PublicDistributionDependencies;
}

const memoryCache = new Map<string, PersistedCatalogCacheEntry>();
const inFlightRefreshes = new Map<string, Promise<PublicCatalogResult>>();

function sourceCacheKey(profile: SourceProfile): string {
    return crypto.createHash('sha256').update(`${profile.id}\0${profile.baseUrl}`).digest('hex');
}

function sourceCachePath(profile: SourceProfile): string {
    const directory = path.join(getCacheDir(), 'module-catalogs');
    ensureOwnerOnlyDirectorySync(directory);
    return path.join(directory, `${sourceCacheKey(profile)}.json`);
}

function isPersistedCacheEntry(value: unknown): value is PersistedCatalogCacheEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Partial<PersistedCatalogCacheEntry>;
    return Number.isSafeInteger(candidate.fetchedAt)
        && Number(candidate.fetchedAt) >= 0
        && validateModuleIndexDocument(candidate.index).valid;
}

function loadCachedCatalog(profile: SourceProfile): PersistedCatalogCacheEntry | undefined {
    const key = sourceCacheKey(profile);
    const inMemory = memoryCache.get(key);
    if (inMemory) return inMemory;
    const filePath = sourceCachePath(profile);
    if (!fs.existsSync(filePath)) return undefined;
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        if (!isPersistedCacheEntry(parsed)) return undefined;
        memoryCache.set(key, parsed);
        return parsed;
    } catch {
        return undefined;
    }
}

function persistCatalog(profile: SourceProfile, entry: PersistedCatalogCacheEntry): void {
    memoryCache.set(sourceCacheKey(profile), entry);
    writeOwnerOnlyFileAtomicSync(sourceCachePath(profile), `${JSON.stringify(entry, null, 2)}\n`);
}

function assertCatalogProfile(profile: SourceProfile): void {
    if (profile.kind !== ModuleSourceKind.Indexed) {
        throw new Error(`Source profile "${profile.id}" is not a public catalog`);
    }
    if (!profile.enabled) throw new Error(`Source profile "${profile.id}" is disabled`);
}

async function refreshCatalog(
    profile: SourceProfile,
    policy: PublicDistributionPolicy,
    now: () => number,
    dependencies: PublicDistributionDependencies,
): Promise<PublicCatalogResult> {
    const cached = loadCachedCatalog(profile);
    try {
        const { value } = await fetchPublicDistributionJson<ModuleIndexDocument>(
            profile.baseUrl,
            policy,
            validateModuleIndexDocument,
            dependencies,
        );
        const entry = { fetchedAt: now(), index: value };
        persistCatalog(profile, entry);
        return {
            sourceId: profile.id,
            sourceName: profile.name,
            sourceUrl: profile.baseUrl,
            state: 'fresh',
            fetchedAt: entry.fetchedAt,
            index: value,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cached) {
            return {
                sourceId: profile.id,
                sourceName: profile.name,
                sourceUrl: profile.baseUrl,
                state: 'stale',
                fetchedAt: cached.fetchedAt,
                index: cached.index,
                error: message,
            };
        }
        return {
            sourceId: profile.id,
            sourceName: profile.name,
            sourceUrl: profile.baseUrl,
            state: 'error',
            error: message,
        };
    }
}

export async function fetchPublicCatalog(
    profile: SourceProfile,
    policy: PublicDistributionPolicy,
    options: PublicCatalogFetchOptions = {},
): Promise<PublicCatalogResult> {
    assertCatalogProfile(profile);
    const now = options.now || Date.now;
    const cached = loadCachedCatalog(profile);
    if (!options.forceRefresh && cached && now() - cached.fetchedAt < PUBLIC_CATALOG_CACHE_TTL_MS) {
        return {
            sourceId: profile.id,
            sourceName: profile.name,
            sourceUrl: profile.baseUrl,
            state: 'cached',
            fetchedAt: cached.fetchedAt,
            index: cached.index,
        };
    }

    const key = sourceCacheKey(profile);
    const pending = inFlightRefreshes.get(key);
    if (pending) return pending;
    const refresh = refreshCatalog(profile, policy, now, options.dependencies || {})
        .finally(() => inFlightRefreshes.delete(key));
    inFlightRefreshes.set(key, refresh);
    return refresh;
}

function catalogSource(profile: SourceProfile): CatalogModuleSource {
    return {
        id: profile.id,
        name: profile.name,
        priority: profile.priority,
        trustTier: profile.trustTier || ModuleTrustTier.Unverified,
    };
}

export async function aggregatePublicCatalogs(
    profiles: SourceProfile[],
    policy: PublicDistributionPolicy,
    options: PublicCatalogFetchOptions = {},
): Promise<PublicCatalogAggregate> {
    const catalogProfiles = profiles
        .filter((profile) => profile.enabled && profile.kind === ModuleSourceKind.Indexed)
        .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
    const sources = await Promise.all(
        catalogProfiles.map((profile) => fetchPublicCatalog(profile, policy, options)),
    );
    const modules: Record<string, CatalogModuleListing> = {};

    for (let index = 0; index < catalogProfiles.length; index += 1) {
        const profile = catalogProfiles[index];
        const catalog = sources[index];
        if (!catalog.index) continue;
        for (const [moduleId, entry] of Object.entries(catalog.index.modules)) {
            const source = catalogSource(profile);
            const existing = modules[moduleId];
            if (!existing) {
                modules[moduleId] = { moduleId, entry, source, alternatives: [] };
            } else {
                existing.alternatives.push(source);
            }
        }
    }

    const conflicts = Object.values(modules)
        .filter((listing) => listing.alternatives.length > 0)
        .map((listing) => ({
            moduleId: listing.moduleId,
            selectedSourceId: listing.source.id,
            shadowedSourceIds: listing.alternatives.map((source) => source.id),
        }));
    return { sources, modules, conflicts };
}

export function __resetPublicCatalogCacheForTests(): void {
    memoryCache.clear();
    inFlightRefreshes.clear();
}
