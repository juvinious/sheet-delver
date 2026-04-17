import { getAdapter } from '@modules/registry/server';
import type { ActorServiceClientLike, RawActor } from '@server/shared/types/actors';

interface NormalizedActor {
    derived?: Record<string, unknown>;
    [key: string]: unknown;
}

export function createActorNormalizationService() {
    // Shared actor projection used by actor and combat services for UI-ready payloads.
    const normalizeActors = async (actorList: RawActor[], client: ActorServiceClientLike) => {
        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id.toLowerCase());
        if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

        const { CompendiumCache } = await import('@core/foundry/compendium-cache');
        const cache = CompendiumCache.getInstance();

        return Promise.all(actorList.map(async (actor) => {
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
            if (adapter.resolveActorNames) await adapter.resolveActorNames(actor, cache);

            if (actor.img) actor.img = client.resolveUrl(actor.img);
            if (actor.prototypeToken?.texture?.src) {
                actor.prototypeToken.texture.src = client.resolveUrl(actor.prototypeToken.texture.src);
            }

            const normalized = adapter.normalizeActorData(actor, client) as NormalizedActor;
            if (adapter.computeActorData) {
                normalized.derived = adapter.computeActorData(normalized) as Record<string, unknown>;
            }

            return normalized;
        }));
    };

    return {
        normalizeActors
    };
}
