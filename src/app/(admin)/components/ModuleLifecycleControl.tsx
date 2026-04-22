'use client';

import React, { useState, useEffect } from 'react';
import { logger } from '@shared/utils/logger';

interface ModuleLifecycleInfo {
  moduleId: string;
  title: string;
  enabled: boolean;
  status: string;
  experimental: boolean;
  reason?: string;
}

export default function ModuleLifecycleControl() {
  const [modules, setModules] = useState<ModuleLifecycleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/admin/lifecycle', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

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
  }, []);

  const handleToggleModule = async (moduleId: string, currentlyEnabled: boolean) => {
    try {
      setOperationInProgress(moduleId);
      setError(null);

      const endpoint = currentlyEnabled ? 'disable' : 'enable';
      const response = await fetch(`/admin/lifecycle/${moduleId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-CSRF': getCsrfToken() || '',
        },
        body: JSON.stringify({
          reason: `Module ${endpoint}d by admin via UI`,
        }),
      });

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
      logger.error(`Failed to ${currentlyEnabled ? 'disable' : 'enable'} module:`, err);
      setError(message);
    } finally {
      setOperationInProgress(null);
    }
  };

  const getCsrfToken = (): string | null => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-100 border border-gray-300 rounded">
        <p className="text-gray-700">Loading modules...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Module Lifecycle Control</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid gap-4">
        {modules.length === 0 ? (
          <p className="text-gray-500">No modules found</p>
        ) : (
          modules.map((module) => (
            <div
              key={module.moduleId}
              className={`p-4 border rounded ${
                module.enabled ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">
                    {module.title}
                    {module.experimental && (
                      <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">
                        Experimental
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600">ID: {module.moduleId}</p>
                  <p className="text-sm">
                    Status: <span className="font-medium">{module.status}</span>
                  </p>
                  {module.reason && (
                    <p className="text-sm text-red-600">Reason: {module.reason}</p>
                  )}
                </div>

                <button
                  onClick={() => handleToggleModule(module.moduleId, module.enabled)}
                  disabled={operationInProgress === module.moduleId}
                  className={`px-4 py-2 rounded font-semibold transition-colors ${
                    module.enabled
                      ? 'bg-red-500 hover:bg-red-600 text-white disabled:bg-red-300'
                      : 'bg-green-500 hover:bg-green-600 text-white disabled:bg-green-300'
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
