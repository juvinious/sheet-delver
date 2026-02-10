// 0 = None, 1 = Error, 2 = Warning, 3 = Info, 4 = Debug
export const LogLevel = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

let cachedLevel: number | null = null;

async function getLevel(): Promise<number> {
    if (cachedLevel !== null) return cachedLevel;

    if (typeof window !== 'undefined') {
        cachedLevel = 3; // In browser, default to INFO
        return cachedLevel;
    }

    try {
        const { loadConfig } = await import('./config');
        const cfg = await loadConfig();
        if (!cfg?.debug?.enabled) {
            cachedLevel = 0;
        } else {
            cachedLevel = cfg.debug.level || 3;
        }
        return cachedLevel;
    } catch (e) {
        return 3; // Fallback to INFO
    }
}

// Initialize level at startup
if (typeof window === 'undefined') {
    getLevel().then(lvl => {
        console.log(`[Logger] Initialized at level: ${lvl}`);
    });
}

export const logger = {
    error: (...args: any[]) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.ERROR) console.error('[ERROR]', ...args); });
    },
    warn: (...args: any[]) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.WARN) console.warn('[WARN]', ...args); });
    },
    info: (...args: any[]) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.INFO) console.log('[INFO]', ...args); });
    },
    debug: (...args: any[]) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.DEBUG) console.log('[DEBUG]', ...args); });
    },
    time: (label: string) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.DEBUG) console.time(label); });
    },
    timeEnd: (label: string) => {
        getLevel().then(lvl => { if (lvl >= LogLevel.DEBUG) console.timeEnd(label); });
    }
};
