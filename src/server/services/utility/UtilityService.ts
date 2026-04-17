import { UserRole } from '@shared/constants';
import { logger } from '@shared/utils/logger';
import { systemService } from '@core/system/SystemService';
import type { UtilityClientLike, UtilitySystemClientLike } from '@server/shared/types/utility';
import type { FoundryUserLike } from '@server/shared/types/foundry';

export function createUtilityService() {
    // Generic Foundry document fetch used by dashboard links and drill-in flows.
    const getFoundryDocument = async (client: UtilityClientLike, uuid?: string) => {
        if (!uuid) return { error: 'Missing uuid', status: 400 };

        const data = await client.fetchByUuid(uuid);
        if (!data) return { error: 'Document not found', status: 404 };

        return data;
    };

    // Session user projection mirrors the public status user shape for dashboard consumers.
    const getSessionUsers = async (client: UtilityClientLike) => {
        const users = await (systemService.getSystemClient() as unknown as UtilitySystemClientLike).getUsers();
        logger.debug(`[API] /session/users: Found ${users.length} users via System Client`);

        const sanitizedUsers = users.map((u: FoundryUserLike) => ({
            _id: u._id || u.id,
            name: u.name,
            role: u.role,
            isGM: (u.role || 0) >= UserRole.ASSISTANT,
            active: u.active,
            color: u.color,
            characterId: u.character,
            img: client.resolveUrl(u.avatar || u.img)
        }));

        return { users: sanitizedUsers };
    };

    // Shared content projection resolves stored image URLs for the requesting user context.
    const getSharedContent = async (client?: UtilityClientLike) => {
        const resolvedClient = (client || systemService.getSystemClient()) as UtilityClientLike & UtilitySystemClientLike;
        const content = resolvedClient.getSharedContent();

        if (content && content.type === 'image' && content.data?.url) {
            content.data.url = resolvedClient.resolveUrl(content.data.url);
        }

        return content || { type: null };
    };

    return {
        getFoundryDocument,
        getSessionUsers,
        getSharedContent
    };
}
