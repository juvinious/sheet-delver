import type { FoundryClientLike, FoundryUserLike } from '@server/shared/types/foundry';

export interface UtilityClientLike extends FoundryClientLike {
    fetchByUuid(uuid: string): Promise<unknown>;
    resolveUrl(url?: string): string;
    getSharedContent?(): { type: string | null; data?: { url?: string; [key: string]: unknown } } | null;
}

export interface UtilitySystemClientLike {
    getUsers(): Promise<FoundryUserLike[]>;
    getSharedContent(): { type: string | null; data?: { url?: string; [key: string]: unknown } } | null;
    resolveUrl(url?: string): string;
}
