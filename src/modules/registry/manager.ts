import { logger } from '@shared/utils/logger';
import type { ModuleLifecycleRecord, ModuleLifecycleStatus } from './lifecycle';
import { assertTransition, checkTransition, isTransientStatus } from './transitions';

/**
 * Minimal artifact metadata stored separately from runtime lifecycle state.
 * Tracks what was installed — version, source, and optional integrity hash.
 */
export interface ModuleArtifactMetadata {
    moduleId: string;
    version: string;
    source: string;
    installedAt: number;
    integrity?: string;
}

/**
 * Result returned from any manager operation.
 */
export interface ManagerOperationResult {
    success: boolean;
    moduleId: string;
    operation: ManagerOperation;
    previousStatus?: ModuleLifecycleStatus;
    newStatus?: ModuleLifecycleStatus;
    error?: string;
}

export type ManagerOperation =
    | 'install'
    | 'uninstall'
    | 'upgrade'
    | 'validate'
    | 'enable'
    | 'disable';

/**
 * Check whether a manager operation can begin on a module.
 * Rejects operations on transient or terminal states.
 */
export function checkOperationPrecondition(
    moduleId: string,
    record: ModuleLifecycleRecord,
    operation: ManagerOperation
): { allowed: boolean; reason?: string } {
    // Block any operation on a module already in a transient (in-flight) state
    if (isTransientStatus(record.status)) {
        return {
            allowed: false,
            reason: `Module "${moduleId}" is currently in "${record.status}" state. Wait for it to complete before retrying.`,
        };
    }

    // Map operations to their required transitions to pre-validate
    const requiredTransition = OPERATION_TRANSITIONS[operation];
    if (!requiredTransition) {
        return { allowed: true };
    }

    const result = checkTransition(record.status, requiredTransition);
    if (!result.allowed) {
        return { allowed: false, reason: result.reason };
    }

    return { allowed: true };
}

/**
 * The "entry" transition each operation initiates.
 * Validate + enable/disable have no single fixed target (context-dependent).
 */
const OPERATION_TRANSITIONS: Partial<Record<ManagerOperation, ModuleLifecycleStatus>> = {
    install:   'installed',
    uninstall: 'uninstalling',
    upgrade:   'upgrading',
};

/**
 * Apply a transition to a lifecycle record and return the updated record.
 * Validates the transition policy before applying.
 * Does NOT persist—caller is responsible for saving the store.
 */
export function applyManagerTransition(
    record: ModuleLifecycleRecord,
    to: ModuleLifecycleStatus,
    reason?: string,
    now = Date.now()
): ModuleLifecycleRecord {
    assertTransition(record.moduleId, record.status, to);

    const enabled = to === 'enabled';
    const disabledOrTerminal =
        to === 'disabled' || to === 'errored' || to === 'uninstalling' || to === 'removed';

    return {
        ...record,
        status: to,
        enabled: enabled ? true : disabledOrTerminal ? false : record.enabled,
        reason,
        updatedAt: now,
    };
}

/**
 * Build a success ManagerOperationResult.
 */
export function operationSuccess(
    moduleId: string,
    operation: ManagerOperation,
    previousStatus: ModuleLifecycleStatus,
    newStatus: ModuleLifecycleStatus
): ManagerOperationResult {
    return { success: true, moduleId, operation, previousStatus, newStatus };
}

/**
 * Build a failure ManagerOperationResult.
 */
export function operationFailure(
    moduleId: string,
    operation: ManagerOperation,
    error: string,
    previousStatus?: ModuleLifecycleStatus
): ManagerOperationResult {
    logger.warn(`[ModuleManager] Operation "${operation}" failed for "${moduleId}": ${error}`);
    return { success: false, moduleId, operation, previousStatus, error };
}
