import fs from 'node:fs';
import path from 'node:path';
import { initDataDir, resolveDataDir } from '@core/paths';
import { loadConfig } from '@core/config';
import {
    applyLocalModuleArchive,
    dryRunLocalModuleArchive,
    type ModuleArchiveOperation,
} from '@modules/registry/server';
import type { ModuleReleaseManifest } from '@modules/registry/releaseManifest';
import type { ModuleTrustTier } from '@shared/types/modules';

const OPERATIONS = new Set([
    'dry-run-install',
    'install',
    'dry-run-upgrade',
    'upgrade',
]);
const VALUE_OPTIONS = new Set([
    '--data-dir',
    '--module-id',
    '--manifest',
    '--trust-tier',
]);
const FLAG_OPTIONS = new Set([
    '--approve-trust-override',
    '--approve-permission-escalation',
]);

function usage(): never {
    console.error(
        'Usage: npm run module:archive -- <dry-run-install|install|dry-run-upgrade|upgrade> <archive.tgz> '
        + '[--data-dir <path>] [--module-id <id>] [--manifest <release-manifest.json>] '
        + '[--trust-tier <first-party|verified-third-party|unverified>] '
        + '[--approve-trust-override] [--approve-permission-escalation]',
    );
    process.exit(1);
}

function readOption(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1]?.trim();
    if (!value || value.startsWith('--')) throw new Error(`Option ${name} requires a value`);
    return value;
}

function parseTrustTier(value: string | undefined): ModuleTrustTier | undefined {
    if (value === undefined) return undefined;
    if (value === 'first-party' || value === 'verified-third-party' || value === 'unverified') {
        return value;
    }
    throw new Error('Option --trust-tier must be first-party, verified-third-party, or unverified');
}

function readReleaseManifest(filePath: string | undefined): ModuleReleaseManifest | undefined {
    if (!filePath) return undefined;
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8')) as ModuleReleaseManifest;
}

async function main(): Promise<void> {
    process.env.NODE_ENV ||= 'production';
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const positionals: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (VALUE_OPTIONS.has(arg)) {
            if (!args[index + 1] || args[index + 1].startsWith('--')) {
                throw new Error(`Option ${arg} requires a value`);
            }
            index += 1;
            continue;
        }
        if (FLAG_OPTIONS.has(arg)) continue;
        if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
        positionals.push(arg);
    }
    if (positionals.length !== 2 || !OPERATIONS.has(positionals[0])) usage();

    const command = positionals[0];
    const operation: ModuleArchiveOperation = command.endsWith('install') ? 'install' : 'upgrade';
    const archivePath = path.resolve(positionals[1]);
    initDataDir(resolveDataDir(process.argv));
    const config = await loadConfig();
    if (!config) throw new Error('Unable to load Sheet Delver configuration');

    const input = {
        archivePath,
        expectedModuleId: readOption(args, '--module-id'),
        releaseManifest: readReleaseManifest(readOption(args, '--manifest')),
        sourceTrustTier: parseTrustTier(readOption(args, '--trust-tier')),
        approveTrustOverride: args.includes('--approve-trust-override'),
        approvePermissionEscalation: args.includes('--approve-permission-escalation'),
    };

    if (command.startsWith('dry-run-')) {
        const result = await dryRunLocalModuleArchive(operation, input);
        console.log(JSON.stringify(result, null, 2));
        if (!result.wouldProceed) process.exitCode = 1;
        return;
    }

    const result = await applyLocalModuleArchive(operation, input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
