import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AppConfig {
    app: {
        host: string;
        port: number;
        protocol: string;
        chatHistory: number;
        version: string;
    };
    foundry: {
        host: string;
        port: number;
        protocol: string;
        url: string;
    };
    debug: {
        enabled: boolean;
        level: number;
        foundryUser?: {
            name: string;
            password?: string;
        };
    };
}

let _cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig | null> {
    if (_cachedConfig) return _cachedConfig;

    try {
        const configPath = path.resolve(process.cwd(), 'settings.yaml');
        const fileContents = await fs.readFile(configPath, 'utf8');
        const doc = yaml.load(fileContents) as any;

        // Read version from package.json
        const packagePath = path.resolve(process.cwd(), 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
        const version = packageJson.version || '0.0.0';

        if (doc) {
            const foundry = doc.foundry || {};
            const app = doc.app || {};
            const debug = doc.debug || {};

            const protocol = foundry.protocol || 'http';
            const host = foundry.host || 'localhost';
            const port = foundry.port || 30000;
            const isStandardPort = (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443);
            const foundryUrl = `${protocol}://${host}${isStandardPort ? '' : `:${port}`}`;

            _cachedConfig = {
                app: {
                    host: app.host || 'localhost',
                    port: app.port || 3000,
                    protocol: app.protocol || 'http',
                    chatHistory: app['chat-history'] || 100,
                    version: version
                },
                foundry: {
                    host: foundry.host || 'localhost',
                    port: foundry.port || 30000,
                    protocol: foundry.protocol || 'http',
                    url: foundryUrl
                },
                debug: {
                    enabled: debug.enabled ?? false,
                    level: debug.level ?? 1,
                    foundryUser: debug.foundryUser
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
