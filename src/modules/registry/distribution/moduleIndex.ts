import { parseModuleId } from '@shared/security/moduleId';

export const MODULE_INDEX_SCHEMA_VERSION = 'sheet-delver-catalog.v1';

export interface ModuleIndexEntry {
    moduleId: string;
    title: string;
    repository: string;
    manifest: string;
    description?: string;
    tags?: string[];
}

export interface ModuleIndexDocument {
    schemaVersion: typeof MODULE_INDEX_SCHEMA_VERSION;
    generatedAt: number;
    publisher: string;
    modules: Record<string, ModuleIndexEntry>;
}

export interface ModuleIndexValidationResult {
    valid: boolean;
    errors: string[];
}

export interface ResolveModuleIndexEntryResult {
    ok: boolean;
    value?: ModuleIndexEntry;
    error?: string;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isHttpsUrl(value: unknown): value is string {
    if (!isNonEmptyString(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

function validateIndexEntry(moduleId: string, value: unknown): string[] {
    const errors: string[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [`Index field "modules.${moduleId}" must be an object`];
    }

    const candidate = value as Partial<ModuleIndexEntry>;
    const canonicalId = parseModuleId(candidate.moduleId);
    if (!canonicalId || canonicalId !== moduleId) {
        errors.push(`Index field "modules.${moduleId}.moduleId" must match its canonical module key`);
    }
    if (!isNonEmptyString(candidate.title)) {
        errors.push(`Index field "modules.${moduleId}.title" must be a non-empty string`);
    }
    if (!isHttpsUrl(candidate.repository)) {
        errors.push(`Index field "modules.${moduleId}.repository" must be a public HTTPS URL without credentials`);
    }
    if (!isHttpsUrl(candidate.manifest)) {
        errors.push(`Index field "modules.${moduleId}.manifest" must be a public HTTPS URL without credentials`);
    }
    if (candidate.description !== undefined && !isNonEmptyString(candidate.description)) {
        errors.push(`Index field "modules.${moduleId}.description" must be a non-empty string when provided`);
    }
    if (candidate.tags !== undefined && !isStringArray(candidate.tags)) {
        errors.push(`Index field "modules.${moduleId}.tags" must be an array of non-empty strings when provided`);
    }
    if (candidate.tags && new Set(candidate.tags).size !== candidate.tags.length) {
        errors.push(`Index field "modules.${moduleId}.tags" must not contain duplicates`);
    }
    if ('trustTier' in candidate) {
        errors.push(`Index field "modules.${moduleId}.trustTier" is not permitted; trust is assigned by local source policy`);
    }

    return errors;
}

export function validateModuleIndexDocument(value: unknown): ModuleIndexValidationResult {
    const errors: string[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, errors: ['Module index root must be an object'] };
    }

    const candidate = value as Partial<ModuleIndexDocument>;
    if (candidate.schemaVersion !== MODULE_INDEX_SCHEMA_VERSION) {
        errors.push(`Index field "schemaVersion" must equal "${MODULE_INDEX_SCHEMA_VERSION}"`);
    }
    if (!Number.isSafeInteger(candidate.generatedAt) || Number(candidate.generatedAt) < 0) {
        errors.push('Index field "generatedAt" must be a non-negative integer timestamp');
    }
    if (!isNonEmptyString(candidate.publisher)) {
        errors.push('Index field "publisher" must be a non-empty string');
    }
    if (!candidate.modules || typeof candidate.modules !== 'object' || Array.isArray(candidate.modules)) {
        errors.push('Index field "modules" must be an object');
    } else {
        for (const [moduleId, moduleEntry] of Object.entries(candidate.modules)) {
            const canonicalKey = parseModuleId(moduleId);
            if (!canonicalKey || canonicalKey !== moduleId) {
                errors.push(`Index field "modules.${moduleId}" must use a canonical module ID key`);
            }
            errors.push(...validateIndexEntry(moduleId, moduleEntry));
        }
    }

    return { valid: errors.length === 0, errors };
}

export function resolveModuleIndexEntry(
    index: ModuleIndexDocument,
    moduleId: string,
): ResolveModuleIndexEntryResult {
    const id = parseModuleId(moduleId);
    if (!id) return { ok: false, error: 'Invalid module ID' };

    const entry = index.modules[id];
    if (!entry) {
        return { ok: false, error: `Module "${id}" was not found in index` };
    }
    return { ok: true, value: entry };
}
