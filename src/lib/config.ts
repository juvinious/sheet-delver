import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AppConfig {
    foundry: {
        protocol: string;
        host: string;
        port: number;
        url: string;
    };
    config: {
        debug: {
            enabled: boolean;
            level: number;
            foundryUser?: {
                name: string;
                password?: string;
            };
        };
        version: string;
        'chat-history'?: number;
    };
}

let _cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig | null> {
    if (_cachedConfig) return _cachedConfig;

    try {
        const configPath = path.resolve(process.cwd(), 'settings.yaml');
        const fileContents = await fs.readFile(configPath, 'utf8');
        const doc = yaml.load(fileContents) as any;

        if (doc && doc.foundry) {
            const { protocol, host, port } = doc.foundry;
            const url = `${protocol}://${host}:${port}`;

            _cachedConfig = {
                foundry: { ...doc.foundry, url },
                config: {
                    ...doc.config,
                    // Ensure defaults if missing
                    debug: {
                        enabled: doc.config?.debug?.enabled ?? false,
                        level: doc.config?.debug?.level ?? 1,
                        foundryUser: doc.config?.debug?.foundryUser
                    },
                    version: doc.config?.version || '0.0.0'
                }
            };
            return _cachedConfig;
        }
    } catch (e) {
        console.error('Failed to load settings.yaml', e);
        return null;
    }
    return null;
}

// Synchronous version if needed, or just use async everywhere.
// For Next.js App Router, async is usually fine.
