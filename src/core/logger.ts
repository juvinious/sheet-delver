// 0 = None, 1 = Error, 2 = Warning, 3 = Info, 4 = Debug
export const LogLevel = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

async function getLevel() {
    if (typeof window !== 'undefined') {
        // In browser, default to INFO or check some other flag
        return 3;
    }

    try {
        const { loadConfig } = await import('./config');
        const cfg = await loadConfig();
        if (!cfg?.debug?.enabled) return 0;
        return cfg.debug.level;
    } catch (e) {
        return 3; // Fallback to INFO
    }
}

export const logger = {
    error: async (...args: any[]) => {
        if (await getLevel() >= LogLevel.ERROR) console.error('[ERROR]', ...args);
    },
    warn: async (...args: any[]) => {
        if (await getLevel() >= LogLevel.WARN) console.warn('[WARN]', ...args);
    },
    info: async (...args: any[]) => {
        if (await getLevel() >= LogLevel.INFO) console.log('[INFO]', ...args);
    },
    debug: async (...args: any[]) => {
        if (await getLevel() >= LogLevel.DEBUG) console.log('[DEBUG]', ...args);
    }
};
