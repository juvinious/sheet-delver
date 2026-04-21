import type { UserSessionLike } from '@server/shared/types/foundry';
import type { RouteFoundryClient } from '@server/shared/types/requestContext';

export type RequestFoundryClient = RouteFoundryClient;

declare global {
    namespace Express {
        interface Request {
            foundryClient: RequestFoundryClient;
            userSession?: UserSessionLike;
            isSystem?: boolean;
        }
    }
}

export {};
