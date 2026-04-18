import type { FoundryClientLike, FoundryUserLike } from '@server/shared/types/foundry';
import type { RealtimeSharedContentPayload } from '@shared/contracts/realtime';

export interface UtilityClientLike extends FoundryClientLike {
    fetchByUuid(uuid: string): Promise<unknown>;
    resolveUrl(url?: string): string;
    getSharedContent?(): RealtimeSharedContentPayload | null;
}

export interface UtilitySystemClientLike {
    getUsers(): Promise<FoundryUserLike[]>;
    getSharedContent(): RealtimeSharedContentPayload | null;
    resolveUrl(url?: string): string;
}
