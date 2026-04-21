import type { RouteFoundryClient } from '@server/shared/types/requestContext';
import type { UserSessionLike } from '@server/shared/types/foundry';

type ModuleRequestLike = Request & {
    foundryClient?: RouteFoundryClient;
    userSession?: UserSessionLike;
};

export function getModuleFoundryClient(request: Request): RouteFoundryClient | null {
    return (request as ModuleRequestLike).foundryClient || null;
}

export function getModuleUserSession(request: Request): UserSessionLike | undefined {
    return (request as ModuleRequestLike).userSession;
}