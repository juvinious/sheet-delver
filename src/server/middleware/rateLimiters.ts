import rateLimit from 'express-rate-limit';
import type { AppConfig } from '@shared/interfaces';

export function createLoginLimiter(config: AppConfig) {
    return rateLimit({
        windowMs: config.security.rateLimit.windowMinutes * 60 * 1000,
        max: config.security.rateLimit.maxAttempts,
        message: {
            error: `Too many login attempts. Please try again after ${config.security.rateLimit.windowMinutes} minutes.`
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => !config.security.rateLimit.enabled,
    });
}
