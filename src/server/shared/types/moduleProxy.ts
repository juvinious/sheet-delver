import type { IncomingHttpHeaders } from 'node:http';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';

export interface ModuleProxyDispatchRequest {
    path: string;
    method: string;
    url: string;
    headers: IncomingHttpHeaders;
    body: unknown;
    foundryClient?: RouteFoundryClient;
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
            foundryClient: RouteFoundryClient;
            userSession?: unknown;
        },
        params: { params: Promise<{ systemId: string; route: string[] }> }
    ): Promise<NextLikeResponse | unknown>;
}

export interface ModuleServerLike {
    apiRoutes?: Record<string, ModuleRouteHandler>;
}
