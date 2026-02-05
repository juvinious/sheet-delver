'use client';

// Log Levels matching settings.yaml
// 0=None, 1=Error, 2=Warn, 3=Info, 4=Debug
export const LOG_LEVEL = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

class FrontendLogger {
    private level: number = LOG_LEVEL.INFO; // Default to INFO

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
            console.log('[INFO]', message, ...args);
        }
    }

    debug(message: string, ...args: any[]) {
        if (this.level >= LOG_LEVEL.DEBUG) {
            console.log('[DEBUG]', message, ...args);
        }
    }
}

export const logger = new FrontendLogger();
