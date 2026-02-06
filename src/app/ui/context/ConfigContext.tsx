'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
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

    const setFoundryUrl = (url: string) => {
        logger.debug(`[ConfigProvider] Setting foundryUrl: ${url}`);
        setConfig(prev => ({ ...prev, foundryUrl: url }));
    };

    const resolveImageUrl = (path: string) => {
        if (!path) return '/placeholder.png';
        if (path.startsWith('http') || path.startsWith('data:')) return path;

        const baseUrl = config.foundryUrl;
        if (baseUrl) {
            const cleanPath = path.startsWith('/') ? path.slice(1) : path;
            const cleanUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
            return `${cleanUrl}${cleanPath}`;
        }
        return path;
    };

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
