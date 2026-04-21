import type { RouteFoundryClient } from '@server/shared/types/requestContext';

type ModuleRequestLike = Request & {
    foundryClient?: RouteFoundryClient;
};

export function getModuleFoundryClient(request: Request): RouteFoundryClient | null {
    return (request as ModuleRequestLike).foundryClient || null;
}