'use client';

import React, { useState, useEffect } from 'react';
import { logger } from '@shared/utils/logger';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminApiPath } from '../lib/adminApi';

interface ModuleLifecycleInfo {
  moduleId: string;
  title: string;
  enabled: boolean;
  status: string;
  experimental: boolean;
  reason?: string;
}

export default function ModuleLifecycleControl() {
  const { token, csrfToken } = useAdminAuth();
  const [modules, setModules] = useState<ModuleLifecycleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const fetchModules = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(adminApiPath('/lifecycle'), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch modules: ${response.statusText}`);
        }

        const data = await response.json();
        setModules(data.modules || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to fetch module lifecycle:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [token]);

  const handleToggleModule = async (moduleId: string, currentlyEnabled: boolean) => {
    if (!token || !csrfToken) {
      setError('Authentication context missing. Please log in again.');
      return;
    }

    try {
      setOperationInProgress(moduleId);
      setError(null);

      const endpoint = currentlyEnabled ? 'disable' : 'enable';
      const response = await fetch(adminApiPath(`/lifecycle/${moduleId}/${endpoint}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Admin-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          reason: `Module ${endpoint}d by admin via UI`,
        }),
      });

      if (response.status === 401) {
        setError('Your session has expired. Please log in again.');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${endpoint} module`);
      }

      const data = await response.json();

      // Update local state
      setModules((prev) =>
        prev.map((m) =>
          m.moduleId === moduleId
            ? {
                ...m,
                enabled: endpoint === 'enable',
                status: endpoint === 'enable' ? 'validated' : 'disabled',
              }
            : m
        )
      );

      logger.info(`Module ${moduleId} ${endpoint}d successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Failed to toggle module:`, err);
      setError(message);
    } finally {
      setOperationInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[24px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
        <p className="text-[var(--admin-text-secondary)]">Loading modules...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-[var(--admin-text-primary)]">Module Lifecycle Control</h2>

      {error && (
        <div className="mb-4 rounded-2xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-bg)] p-3 text-[var(--admin-danger-text)]">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {modules.length === 0 ? (
          <p className="text-[var(--admin-text-muted)]">No modules found</p>
        ) : (
          modules.map((module) => (
            <div
              key={module.moduleId}
              className={`rounded-[24px] border p-4 ${
                module.enabled
                  ? 'border-[var(--admin-success-border)] bg-[var(--admin-success-bg)]'
                  : 'border-[var(--admin-border)] bg-[var(--admin-surface)]'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--admin-text-primary)]">
                    {module.title}
                    {module.experimental && (
                      <span className="ml-2 rounded-full border border-[var(--admin-warning-border)] bg-[var(--admin-warning-bg)] px-2 py-1 text-xs text-[var(--admin-warning-text)]">
                        Experimental
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-[var(--admin-text-secondary)]">ID: {module.moduleId}</p>
                  <p className="text-sm text-[var(--admin-text-secondary)]">
                    Status: <span className="font-medium text-[var(--admin-text-primary)]">{module.status}</span>
                  </p>
                  {module.reason && (
                    <p className="text-sm text-[var(--admin-danger-text)]">Reason: {module.reason}</p>
                  )}
                </div>

                <button
                  onClick={() => handleToggleModule(module.moduleId, module.enabled)}
                  disabled={operationInProgress === module.moduleId}
                  className={`ml-4 whitespace-nowrap rounded-2xl px-4 py-2 font-semibold transition ${
                    module.enabled
                      ? 'bg-[var(--admin-danger-button)] text-white hover:bg-[var(--admin-danger-button-strong)] disabled:bg-[var(--admin-danger-button-soft)]'
                      : 'bg-[var(--admin-success)] text-white hover:bg-[var(--admin-success-strong)] disabled:bg-[var(--admin-success-soft)]'
                  }`}
                >
                  {operationInProgress === module.moduleId
                    ? 'Processing...'
                    : module.enabled
                      ? 'Disable'
                      : 'Enable'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
