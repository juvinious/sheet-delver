// Log Levels matching settings.yaml
// 0=None, 1=Error, 2=Warn, 3=Info, 4=Debug
export const LOG_LEVEL = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
} as const;

export type LogLevel = typeof LOG_LEVEL[keyof typeof LOG_LEVEL];

class UniversalLogger {
    private level: number = LOG_LEVEL.INFO; // Default to INFO

    /**
     * Update the log level at runtime.
     * On Server: Call this after config is loaded.
     * On Client: Call this after fetching the sanitized config proxy.
     */
    setLevel(level: number) {
        this.level = level;
    }

    error(message: string, ...args: any[]) {
        if (this.level >= LOG_LEVEL.ERROR) {
            console.error('[ERROR]', message, ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        if (this.level >= LOG_LEVEL.WARN) {
            console.warn('[WARN]', message, ...args);
        }
    }

    info(message: string, ...args: any[]) {
        if (this.level >= LOG_LEVEL.INFO) {
            console.info('[INFO]', message, ...args);
        }
    }

    debug(message: string, ...args: any[]) {
        if (this.level >= LOG_LEVEL.DEBUG) {
            console.debug('[DEBUG]', message, ...args);
        }
    }

    time(label: string) {
        if (this.level >= LOG_LEVEL.DEBUG) {
            console.time(label);
        }
    }

    timeEnd(label: string) {
        if (this.level >= LOG_LEVEL.DEBUG) {
            console.timeEnd(label);
        }
    }
}

export const logger = new UniversalLogger();
