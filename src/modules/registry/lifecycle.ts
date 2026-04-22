import fs from 'node:fs';
import path from 'node:path';

export type ModuleLifecycleStatus =
    | 'discovered'
    | 'validated'
    | 'enabled'
    | 'disabled'
    | 'incompatible'
    | 'errored';

export interface ModuleLifecycleRecord {
    moduleId: string;
    title: string;
    directory: string;
    status: ModuleLifecycleStatus;
    enabled: boolean;
    reason?: string;
    firstSeenAt: number;
    lastSeenAt: number;
    updatedAt: number;
}

export interface ModuleLifecycleStore {
    version: 1;
    modules: Record<string, ModuleLifecycleRecord>;
}

export interface DiscoveredModuleInput {
    moduleId: string;
    title: string;
    directory: string;
}

export function createEmptyLifecycleStore(): ModuleLifecycleStore {
    return {
        version: 1,
        modules: {}
    };
}

export function getDefaultLifecycleStateFilePath(): string {
    return path.join(process.cwd(), '.data', 'modules', 'state.json');
}

function isValidStatus(value: unknown): value is ModuleLifecycleStatus {
    return value === 'discovered'
        || value === 'validated'
        || value === 'enabled'
        || value === 'disabled'
        || value === 'incompatible'
        || value === 'errored';
}

function isValidRecord(value: unknown): value is ModuleLifecycleRecord {
    if (!value || typeof value !== 'object') return false;

    const record = value as Partial<ModuleLifecycleRecord>;
    return typeof record.moduleId === 'string'
        && typeof record.title === 'string'
        && typeof record.directory === 'string'
        && isValidStatus(record.status)
        && typeof record.enabled === 'boolean'
        && typeof record.firstSeenAt === 'number'
        && typeof record.lastSeenAt === 'number'
        && typeof record.updatedAt === 'number';
}

export function loadLifecycleStore(stateFilePath = getDefaultLifecycleStateFilePath()): ModuleLifecycleStore {
    if (!fs.existsSync(stateFilePath)) {
        return createEmptyLifecycleStore();
    }

    try {
        const raw = fs.readFileSync(stateFilePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<ModuleLifecycleStore>;

        if (parsed.version !== 1 || !parsed.modules || typeof parsed.modules !== 'object') {
            return createEmptyLifecycleStore();
        }

        const modules: Record<string, ModuleLifecycleRecord> = {};
        for (const [id, record] of Object.entries(parsed.modules)) {
            if (isValidRecord(record)) {
                modules[id] = record;
            }
        }

        return {
            version: 1,
            modules
        };
    } catch {
        return createEmptyLifecycleStore();
    }
}

export function saveLifecycleStore(
    store: ModuleLifecycleStore,
    stateFilePath = getDefaultLifecycleStateFilePath()
): void {
    const dir = path.dirname(stateFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(stateFilePath, JSON.stringify(store, null, 2), 'utf8');
}

export function upsertDiscoveredModule(
    store: ModuleLifecycleStore,
    discovered: DiscoveredModuleInput,
    now = Date.now()
): ModuleLifecycleRecord {
    const existing = store.modules[discovered.moduleId];

    if (existing) {
        const next: ModuleLifecycleRecord = {
            ...existing,
            title: discovered.title,
            directory: discovered.directory,
            lastSeenAt: now,
            updatedAt: now
        };
        store.modules[discovered.moduleId] = next;
        return next;
    }

    const created: ModuleLifecycleRecord = {
        moduleId: discovered.moduleId,
        title: discovered.title,
        directory: discovered.directory,
        status: 'discovered',
        enabled: true,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now
    };

    store.modules[discovered.moduleId] = created;
    return created;
}

export function getLifecycleRecords(store: ModuleLifecycleStore): ModuleLifecycleRecord[] {
    return Object.values(store.modules).sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}
