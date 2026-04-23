import type { SystemModuleInfo } from './types';

export interface ModuleValidationResult {
    valid: boolean;
    errors: string[];
}

export interface ModuleCompatibilityResult {
    compatible: boolean;
    reason?: string;
    coreVersion: string;
    requiredCoreVersion?: string;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
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

    if (!requiredCoreVersion) {
        return {
            compatible: true,
            coreVersion
        };
    }

    const constraints = splitConstraints(requiredCoreVersion);
    if (constraints.length === 0) {
        return {
            compatible: false,
            coreVersion,
            requiredCoreVersion,
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
                reason: result.error
            };
        }
        if (!result.ok) {
            return {
                compatible: false,
                coreVersion,
                requiredCoreVersion,
                reason: `Core ${coreVersion} does not satisfy constraint ${constraint}`
            };
        }
    }

    return {
        compatible: true,
        coreVersion,
        requiredCoreVersion
    };
}
