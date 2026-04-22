import type { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/utils/logger';

function normalizeAddress(address: string | undefined): string | undefined {
    if (!address) {
        return undefined;
    }

    return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function isLoopbackAddress(address: string | undefined): boolean {
    const normalized = normalizeAddress(address);
    return normalized === '127.0.0.1' || normalized === '::1';
}

function getForwardedClientAddress(req: Request): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor !== 'string') {
        return undefined;
    }

    const [firstHop] = forwardedFor.split(',');
    return normalizeAddress(firstHop?.trim());
}

/**
 * Middleware that restricts access to localhost only.
 * Used by the admin router to block non-local callers.
 */
export function requireLocalhost(req: Request, res: Response, next: NextFunction): void {
    const socketAddress = normalizeAddress(req.socket.remoteAddress);
    const forwardedClientAddress = isLoopbackAddress(socketAddress) ? getForwardedClientAddress(req) : undefined;
    const effectiveAddress = forwardedClientAddress || socketAddress;

    if (!isLoopbackAddress(effectiveAddress)) {
        logger.warn(`Core Service | Blocked non-local Admin API request from ${effectiveAddress}`);
        res.status(403).json({ error: 'Admin access restricted to localhost' });
        return;
    }
    next();
}
