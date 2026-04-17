import type { IncomingHttpHeaders } from 'node:http';
import type { FoundryClientLike } from '@server/shared/types/foundry';

export interface ModuleProxyDispatchRequest {
    path: string;
    method: string;
    url: string;
    headers: IncomingHttpHeaders;
    body: unknown;
    foundryClient?: FoundryClientLike;
    userSession?: unknown;
}

export interface ModuleProxyDispatchResult {
    status: number;
    payload: unknown;
}

export interface NextLikeResponse {
    status?: number;
    json?: () => Promise<unknown>;
}

export interface ModuleRouteHandler {
    (
        req: {
            json: () => Promise<unknown>;
            method: string;
            url: string;
            headers: IncomingHttpHeaders;
            foundryClient: FoundryClientLike;
            userSession?: unknown;
        },
        params: { params: Promise<{ systemId: string; route: string[] }> }
    ): Promise<NextLikeResponse | unknown>;
}

export interface ModuleServerLike {
    apiRoutes?: Record<string, ModuleRouteHandler>;
}
