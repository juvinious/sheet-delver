import type { SystemModuleInfo } from './types';
import { getCoreContractRegistry } from './contractRegistry';

export interface ModuleValidationResult {
    valid: boolean;
    errors: string[];
}

export interface ModuleCompatibilityResult {
    compatible: boolean;
    reason?: string;
    coreVersion: string;
    requiredCoreVersion?: string;
    requiredApiContracts?: Record<string, string>;
    providedApiContracts?: Record<string, string>;
    contractDiagnostics?: ModuleContractDiagnostic[];
}

export interface ModuleContractDiagnostic {
    contract: string;
    requiredRange: string;
    providedVersion?: string;
    compatible: boolean;
    reason?: string;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(([key, entry]) => isNonEmptyString(key) && isNonEmptyString(entry));
}

function isValidTrustTier(value: unknown): boolean {
    return value === 'first-party' || value === 'verified-third-party' || value === 'unverified';
}

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
    const cleaned = version.trim().replace(/^v/i, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };
}

function compareSemver(a: { major: number; minor: number; patch: number }, b: { major: number; minor: number; patch: number }): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

function evaluateConstraint(currentVersion: string, token: string): { ok: boolean; error?: string } {
    const trimmed = token.trim();
    if (!trimmed) return { ok: true };

    const match = trimmed.match(/^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)$/);
    if (!match) {
        return { ok: false, error: `Unsupported version constraint token: "${trimmed}"` };
    }

    const operator = match[1] || '=';
    const targetVersion = parseSemver(match[2]);
    const current = parseSemver(currentVersion);

    if (!targetVersion || !current) {
        return { ok: false, error: 'Invalid semantic version format for compatibility check' };
    }

    const cmp = compareSemver(current, targetVersion);

    if (operator === '=') return { ok: cmp === 0 };
    if (operator === '>') return { ok: cmp > 0 };
    if (operator === '>=') return { ok: cmp >= 0 };
    if (operator === '<') return { ok: cmp < 0 };
    if (operator === '<=') return { ok: cmp <= 0 };

    return { ok: false, error: `Unsupported operator: ${operator}` };
}

function splitConstraints(range: string): string[] {
    return range
        .split(/[\s,]+/g)
        .map((token) => token.trim())
        .filter(Boolean);
}

export function validateModuleInfoShape(info: unknown): ModuleValidationResult {
    const errors: string[] = [];

    if (!info || typeof info !== 'object') {
        return { valid: false, errors: ['Manifest root must be an object'] };
    }

    const candidate = info as Partial<SystemModuleInfo>;

    if (!isNonEmptyString(candidate.id)) {
        errors.push('Manifest field "id" must be a non-empty string');
    }

    if (!isNonEmptyString(candidate.title)) {
        errors.push('Manifest field "title" must be a non-empty string');
    }

    if (!candidate.manifest || typeof candidate.manifest !== 'object') {
        errors.push('Manifest field "manifest" must be an object');
    } else {
        if (!isNonEmptyString(candidate.manifest.ui)) {
            errors.push('Manifest field "manifest.ui" must be a non-empty string');
        }
        if (!isNonEmptyString(candidate.manifest.logic)) {
            errors.push('Manifest field "manifest.logic" must be a non-empty string');
        }
        if (candidate.manifest.server !== undefined && !isNonEmptyString(candidate.manifest.server)) {
            errors.push('Manifest field "manifest.server" must be a non-empty string when provided');
        }
    }

    if (candidate.aliases !== undefined) {
        if (!Array.isArray(candidate.aliases) || candidate.aliases.some((alias) => !isNonEmptyString(alias))) {
            errors.push('Manifest field "aliases" must be an array of non-empty strings when provided');
        }
    }

    if (candidate.experimental !== undefined && typeof candidate.experimental !== 'boolean') {
        errors.push('Manifest field "experimental" must be a boolean when provided');
    }

    if (candidate.trust !== undefined) {
        if (!candidate.trust || typeof candidate.trust !== 'object') {
            errors.push('Manifest field "trust" must be an object when provided');
        } else if (!isValidTrustTier((candidate.trust as { tier?: unknown }).tier)) {
            errors.push('Manifest field "trust.tier" must be one of: first-party, verified-third-party, unverified');
        }
    }

    if (candidate.permissions !== undefined) {
        if (!candidate.permissions || typeof candidate.permissions !== 'object') {
            errors.push('Manifest field "permissions" must be an object when provided');
        } else {
            const permissions = candidate.permissions;
            if (permissions.network !== undefined) {
                if (!permissions.network || typeof permissions.network !== 'object') {
                    errors.push('Manifest field "permissions.network" must be an object when provided');
                } else {
                    if (permissions.network.outbound !== undefined && typeof permissions.network.outbound !== 'boolean') {
                        errors.push('Manifest field "permissions.network.outbound" must be a boolean when provided');
                    }
                    if (permissions.network.allowHosts !== undefined && !isStringArray(permissions.network.allowHosts)) {
                        errors.push('Manifest field "permissions.network.allowHosts" must be an array of non-empty strings when provided');
                    }
                }
            }

            if (permissions.filesystem !== undefined) {
                if (!permissions.filesystem || typeof permissions.filesystem !== 'object') {
                    errors.push('Manifest field "permissions.filesystem" must be an object when provided');
                } else {
                    if (permissions.filesystem.read !== undefined && !isStringArray(permissions.filesystem.read)) {
                        errors.push('Manifest field "permissions.filesystem.read" must be an array of non-empty strings when provided');
                    }
                    if (permissions.filesystem.write !== undefined && !isStringArray(permissions.filesystem.write)) {
                        errors.push('Manifest field "permissions.filesystem.write" must be an array of non-empty strings when provided');
                    }
                }
            }

            if (permissions.adminRoutes !== undefined && typeof permissions.adminRoutes !== 'boolean') {
                errors.push('Manifest field "permissions.adminRoutes" must be a boolean when provided');
            }

            if (permissions.sensitiveData !== undefined && !isStringArray(permissions.sensitiveData)) {
                errors.push('Manifest field "permissions.sensitiveData" must be an array of non-empty strings when provided');
            }
        }
    }

    if (candidate.compatibility !== undefined) {
        if (!candidate.compatibility || typeof candidate.compatibility !== 'object') {
            errors.push('Manifest field "compatibility" must be an object when provided');
        } else {
            if (candidate.compatibility.coreVersion !== undefined && !isNonEmptyString(candidate.compatibility.coreVersion)) {
                errors.push('Manifest field "compatibility.coreVersion" must be a non-empty string when provided');
            }
            if (
                candidate.compatibility.apiContracts !== undefined
                && !isStringRecord(candidate.compatibility.apiContracts)
            ) {
                errors.push('Manifest field "compatibility.apiContracts" must be a record of non-empty string keys to non-empty version range strings when provided');
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export function evaluateModuleCompatibility(
    info: SystemModuleInfo,
    coreVersion: string
): ModuleCompatibilityResult {
    const requiredCoreVersion = info.compatibility?.coreVersion;
    const requiredApiContracts = info.compatibility?.apiContracts;
    const providedApiContracts: Record<string, string> = getCoreContractRegistry();

    if (requiredCoreVersion) {
        const constraints = splitConstraints(requiredCoreVersion);
        if (constraints.length === 0) {
            return {
                compatible: false,
                coreVersion,
                requiredCoreVersion,
                requiredApiContracts,
                providedApiContracts,
                reason: 'Empty core version compatibility constraint'
            };
        }

        for (const constraint of constraints) {
            const result = evaluateConstraint(coreVersion, constraint);
            if (result.error) {
                return {
                    compatible: false,
                    coreVersion,
                    requiredCoreVersion,
                    requiredApiContracts,
                    providedApiContracts,
                    reason: result.error
                };
            }
            if (!result.ok) {
                return {
                    compatible: false,
                    coreVersion,
                    requiredCoreVersion,
                    requiredApiContracts,
                    providedApiContracts,
                    reason: `Core ${coreVersion} does not satisfy constraint ${constraint}`
                };
            }
        }
    }

    const contractDiagnostics: ModuleContractDiagnostic[] = [];
    if (requiredApiContracts && Object.keys(requiredApiContracts).length > 0) {
        const entries = Object.entries(requiredApiContracts).sort(([a], [b]) => a.localeCompare(b));
        for (const [contract, requiredRange] of entries) {
            const providedVersion = providedApiContracts[contract];
            if (!providedVersion) {
                contractDiagnostics.push({
                    contract,
                    requiredRange,
                    compatible: false,
                    reason: `Contract "${contract}" is not provided by core`,
                });
                continue;
            }

            const constraints = splitConstraints(requiredRange);
            if (constraints.length === 0) {
                contractDiagnostics.push({
                    contract,
                    requiredRange,
                    providedVersion,
                    compatible: false,
                    reason: `Contract "${contract}" has an empty required range`,
                });
                continue;
            }

            let failedReason: string | undefined;
            for (const constraint of constraints) {
                const result = evaluateConstraint(providedVersion, constraint);
                if (result.error) {
                    failedReason = `Contract "${contract}" has invalid constraint: ${result.error}`;
                    break;
                }
                if (!result.ok) {
                    failedReason = `Contract ${contract} ${providedVersion} does not satisfy constraint ${constraint}`;
                    break;
                }
            }

            contractDiagnostics.push({
                contract,
                requiredRange,
                providedVersion,
                compatible: !failedReason,
                reason: failedReason,
            });
        }
    }

    const failingContract = contractDiagnostics.find((entry) => !entry.compatible);
    if (failingContract) {
        return {
            compatible: false,
            reason: failingContract.reason || `Contract ${failingContract.contract} is incompatible`,
            coreVersion,
            requiredCoreVersion,
            requiredApiContracts,
            providedApiContracts,
            contractDiagnostics,
        };
    }

    return {
        compatible: true,
        coreVersion,
        requiredCoreVersion,
        requiredApiContracts,
        providedApiContracts,
        contractDiagnostics: contractDiagnostics.length > 0 ? contractDiagnostics : undefined,
    };
}
