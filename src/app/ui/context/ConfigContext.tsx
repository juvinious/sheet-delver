'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { logger } from '../logger';

interface Config {
    foundryUrl?: string;
}

interface ConfigContextType {
    config: Config;
    setFoundryUrl: (url: string) => void;
    foundryUrl?: string;
    resolveImageUrl: (path: string) => string;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<Config>({});

    const setFoundryUrl = useCallback((url: string) => {
        if (!url || url === config.foundryUrl) return;
        logger.debug(`[ConfigProvider] Setting foundryUrl: ${url}`);
        setConfig(prev => ({ ...prev, foundryUrl: url }));
    }, [config.foundryUrl]);

    if (typeof window !== 'undefined') {
        (window as any)._sd_config_actions = { setFoundryUrl, foundryUrl: config.foundryUrl };
    }

    const resolveImageUrl = useCallback((path: string) => {
        if (!path) return '/placeholder.png';
        // If it's already an absolute URL or data URL, return as is
        if (path.startsWith('http') || path.startsWith('https') || path.startsWith('data:')) return path;

        const baseUrl = config.foundryUrl;
        if (baseUrl) {
            const cleanPath = path.startsWith('/') ? path.slice(1) : path;
            const cleanUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
            return `${cleanUrl}${cleanPath}`;
        }
        return path;
    }, [config.foundryUrl]);

    return (
        <ConfigContext.Provider value={{ config, setFoundryUrl, foundryUrl: config.foundryUrl, resolveImageUrl }}>
            {children}
        </ConfigContext.Provider>
    );
}

export function useConfig() {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
}
