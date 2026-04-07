import crypto from 'crypto';

interface TokenData {
    token: string;
    createdAt: number;
    expiresAt: number;
    used: boolean;
}

const TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

export class SetupToken {
    private static instance: TokenData | null = null;

    /**
     * Generate a new setup token
     */
    static generate(): string {
        const token = crypto.randomBytes(16).toString('hex');
        const now = Date.now();

        this.instance = {
            token,
            createdAt: now,
            expiresAt: now + TOKEN_LIFETIME_MS,
            used: false
        };

        return token;
    }

    /**
     * Validate a token
     */
    static validate(token: string): boolean {
        if (!this.instance) return false;
        if (this.instance.used) return false;
        if (Date.now() > this.instance.expiresAt) return false;
        return this.instance.token === token;
    }

    /**
     * Invalidate the current token (mark as used)
     */
    static invalidate(): void {
        if (this.instance) {
            this.instance.used = true;
        }
    }

    /**
     * Get current token (for display in console)
     */
    static getCurrent(): string | null {
        if (!this.instance) return null;
        if (this.instance.used) return null;
        if (Date.now() > this.instance.expiresAt) return null;
        return this.instance.token;
    }

    /**
     * Check if setup is allowed (no valid cache exists)
     */
    static isSetupRequired(): boolean {
        // This will be checked by the API endpoint
        return true; // For now, always allow setup
    }
}
