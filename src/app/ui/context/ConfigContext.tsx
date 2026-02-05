'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Config {
    foundryUrl?: string;
}

interface ConfigContextType {
    config: Config;
    setFoundryUrl: (url: string) => void;
    foundryUrl?: string;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<Config>({});

    const setFoundryUrl = (url: string) => {
        console.log(`[ConfigProvider] Setting foundryUrl: ${url}`);
        setConfig(prev => ({ ...prev, foundryUrl: url }));
    };

    return (
        <ConfigContext.Provider value={{ config, setFoundryUrl, foundryUrl: config.foundryUrl }}>
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
