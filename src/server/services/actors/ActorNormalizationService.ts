import { getAdapter } from '@modules/registry/server';

export function createActorNormalizationService() {
    // Shared actor projection used by actor and combat services for UI-ready payloads.
    const normalizeActors = async (actorList: any[], client: any) => {
        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

        const { CompendiumCache } = await import('@core/foundry/compendium-cache');
        const cache = CompendiumCache.getInstance();

        return Promise.all(actorList.map(async (actor: any) => {
            if (!actor.computed) actor.computed = {};
            if (!actor.computed.resolvedNames) actor.computed.resolvedNames = {};
            if (adapter.resolveActorNames) await adapter.resolveActorNames(actor, cache);

            if (actor.img) actor.img = client.resolveUrl(actor.img);
            if (actor.prototypeToken?.texture?.src) {
                actor.prototypeToken.texture.src = client.resolveUrl(actor.prototypeToken.texture.src);
            }

            const normalized = adapter.normalizeActorData(actor, client);
            if (adapter.computeActorData) {
                normalized.derived = adapter.computeActorData(normalized);
            }

            return normalized;
        }));
    };

    return {
        normalizeActors
    };
}
