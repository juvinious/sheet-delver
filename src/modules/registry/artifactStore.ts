import fs from 'node:fs';
import path from 'node:path';
import type { ModuleArtifactMetadata } from './manager';

export interface ModuleArtifactStore {
    version: 1;
    artifacts: Record<string, ModuleArtifactMetadata>;
}

export function getDefaultArtifactStoreFilePath(): string {
    return path.join(process.cwd(), '.data', 'modules', 'artifacts.json');
}

function createEmptyArtifactStore(): ModuleArtifactStore {
    return { version: 1, artifacts: {} };
}

function isValidArtifact(value: unknown): value is ModuleArtifactMetadata {
    if (!value || typeof value !== 'object') return false;
    const a = value as Partial<ModuleArtifactMetadata>;
    return (
        typeof a.moduleId === 'string' &&
        typeof a.version === 'string' &&
        typeof a.source === 'string' &&
        typeof a.installedAt === 'number'
    );
}

export function loadArtifactStore(
    filePath = getDefaultArtifactStoreFilePath()
): ModuleArtifactStore {
    if (!fs.existsSync(filePath)) return createEmptyArtifactStore();

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<ModuleArtifactStore>;

        if (parsed.version !== 1 || !parsed.artifacts || typeof parsed.artifacts !== 'object') {
            return createEmptyArtifactStore();
        }

        const artifacts: Record<string, ModuleArtifactMetadata> = {};
        for (const [id, artifact] of Object.entries(parsed.artifacts)) {
            if (isValidArtifact(artifact)) {
                artifacts[id] = artifact;
            }
        }
        return { version: 1, artifacts };
    } catch {
        return createEmptyArtifactStore();
    }
}

export function saveArtifactStore(
    store: ModuleArtifactStore,
    filePath = getDefaultArtifactStoreFilePath()
): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

export function upsertArtifact(
    store: ModuleArtifactStore,
    artifact: ModuleArtifactMetadata
): void {
    store.artifacts[artifact.moduleId] = artifact;
}

export function removeArtifact(store: ModuleArtifactStore, moduleId: string): void {
    delete store.artifacts[moduleId];
}

export function getArtifact(
    store: ModuleArtifactStore,
    moduleId: string
): ModuleArtifactMetadata | undefined {
    return store.artifacts[moduleId];
}
