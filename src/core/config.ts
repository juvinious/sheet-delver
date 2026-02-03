import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import { AppConfig } from '@/shared/interfaces';

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

            const envUrl = process.env.FOUNDRY_URL;
            const envHost = process.env.FOUNDRY_HOST;
            const envPort = process.env.FOUNDRY_PORT ? parseInt(process.env.FOUNDRY_PORT) : undefined;
            const envProtocol = process.env.FOUNDRY_PROTOCOL;
            const envUsername = process.env.FOUNDRY_USERNAME;
            const envPassword = process.env.FOUNDRY_PASSWORD;

            const protocol = envProtocol || foundry.protocol || 'http';
            const host = envHost || foundry.host || 'localhost';
            const port = envPort || foundry.port || 30000;
            const isStandardPort = (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443);

            // Priority: Env URL -> Constructed from Env Host/Port -> Config URL -> Constructed from Config Host/Port
            const foundryUrl = envUrl || (envHost ? `${protocol}://${host}${isStandardPort ? '' : `:${port}`}` : null) || foundry.url || `${protocol}://${host}${isStandardPort ? '' : `:${port}`}`;

            _cachedConfig = {
                app: {
                    host: app.host || 'localhost',
                    port: app.port || 3000,
                    apiPort: app['api-port'] || 3001,
                    protocol: app.protocol || 'http',
                    chatHistory: app['chat-history'] || 100,
                    version: version
                },
                foundry: {
                    host: host,
                    port: port,
                    protocol: protocol,
                    url: foundryUrl,
                    username: envUsername || foundry.username,
                    password: envPassword || foundry.password,
                    userId: foundry.userId,
                    connector: foundry.connector,
                    foundryDataDirectory: foundry.foundryDataDirectory,
                },
                debug: {
                    enabled: debug.enabled ?? false,
                    level: debug.level ?? 1
                }
            };
            return _cachedConfig;
        }
    } catch (e) {
        console.error('\n\x1b[31m[Config] Error: settings.yaml not found or invalid.\x1b[0m');
        console.error('Please run \x1b[33mnpm run setup\x1b[0m to configure the application.\n');
        process.exit(1);
    }
    return null;
}

/**
 * Get config synchronously (requires config to be loaded first)
 * For use in API routes after initial load
 */
export function getConfig(): AppConfig {
    if (!_cachedConfig) {
        throw new Error('Config not loaded. Call loadConfig() first.');
    }
    return _cachedConfig;
}
