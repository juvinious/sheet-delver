import { loadConfig } from '@/core/config';

/**
 * Get the internal URL for the Core Service
 */
async function getCoreUrl(isAdmin = false) {
    const config = await loadConfig();
    const port = (config?.app.port || 3000) + 1;
    // Core service is always on localhost from the Shell's perspective
    return `http://127.0.0.1:${port}${isAdmin ? '/admin' : '/api'}`;
}

/**
 * Shared fetch wrapper for Core Service communication
 */
export async function coreFetch(path: string, options: RequestInit & { admin?: boolean } = {}) {
    const { admin, ...fetchOptions } = options;
    const baseUrl = await getCoreUrl(admin);
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            headers: {
                'Content-Type': 'application/json',
                ...fetchOptions.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: `Core Service error: ${response.status}` }));
            throw new Error(error.error || `Core Service returned ${response.status}`);
        }

        return await response.json();
    } catch (error: any) {
        console.error(`Core API | ${admin ? 'Admin' : 'App'} Fetch failed for ${path}:`, error.message);
        throw error;
    }
}
