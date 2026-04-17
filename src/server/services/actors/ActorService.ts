import type { AppConfig } from '@shared/interfaces';
import { logger } from '@shared/utils/logger';
import { getAdapter, getMatchingAdapter } from '@modules/registry/server';

interface ActorServiceDeps {
    normalizeActors: (actorList: any[], client: any) => Promise<any[]>;
    config: AppConfig;
}

export function createActorService(deps: ActorServiceDeps) {
    // Actor list projection: owned/read-only partition + normalized payload.
    const listActors = async (client: any) => {
        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

        const rawActors = await client.getActors();
        const normalize = async (actorList: any[]) => deps.normalizeActors(actorList, client);
        const currentUserId = client.userId;

        const actorTypes = new Set(rawActors.map((a: any) => a.type));
        const actorFolders = new Set(rawActors.map((a: any) => a.folder).filter(Boolean));
        logger.info(`Core Service | Actor types found: ${Array.from(actorTypes).join(', ')}`);
        logger.info(`Core Service | Actor folders found: ${Array.from(actorFolders).join(', ')}`);

        const owned = rawActors.filter((a: any) =>
            a.ownership?.[currentUserId!] === 3 || a.ownership?.default === 3
        );

        const observable = rawActors.filter((a: any) => {
            const isOwned = owned.includes(a);
            if (isOwned) return false;

            const userPermission = a.ownership?.[currentUserId!] || a.ownership?.default || 0;
            const isObservable = userPermission >= 1;
            const actorType = (a.type || '').toLowerCase();
            const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';

            return isObservable && !isNPC;
        });

        const ownedCharacters = owned.filter((a: any) => {
            const actorType = (a.type || '').toLowerCase();
            const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';
            return !isNPC;
        });

        logger.info(`Core Service | Filtered actors - Owned: ${ownedCharacters.length}, Observable: ${observable.length}, Total raw: ${rawActors.length}`);

        return {
            actors: await normalize(ownedCharacters),
            ownedActors: await normalize(ownedCharacters),
            readOnlyActors: await normalize(observable),
            system: systemInfo.id
        };
    };

    // Actor card projections used by dashboard card views.
    const getActorCards = async (client: any) => {
        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter || !adapter.getActorCardData) {
            return {};
        }

        const rawActors = await client.getActors();
        const cards: Record<string, any> = {};

        for (const actor of rawActors) {
            const id = actor._id || actor.id;
            cards[id] = adapter.getActorCardData(actor);
        }

        return cards;
    };

    const getActorCardById = async (client: any, actorId: string) => {
        const actor = await client.getActor(actorId);
        if (!actor || actor.error) {
            return {
                error: actor?.error || 'Actor not found',
                status: actor?.error ? 503 : 404
            };
        }

        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter || !adapter.getActorCardData) {
            return {};
        }

        return adapter.getActorCardData(actor);
    };

    // Actor detail resolver: UUID resolution + adapter normalization + derived data.
    const getActorById = async (client: any, actorId: string) => {
        const actor = await client.getActor(actorId);
        if (!actor || actor.error) {
            return {
                error: actor?.error || 'Actor not found',
                status: actor?.error ? 503 : 404
            };
        }

        const { CompendiumCache } = await import('@core/foundry/compendium-cache');
        const cache = CompendiumCache.getInstance();

        const resolveUUIDs = (obj: any): any => {
            if (typeof obj === 'string') {
                if (obj.startsWith('Compendium.')) {
                    const name = cache.getName(obj);
                    return name || obj;
                }
                return obj;
            }
            if (Array.isArray(obj)) return obj.map(item => resolveUUIDs(item));
            if (typeof obj === 'object' && obj !== null) {
                const newObj: any = {};
                for (const key in obj) newObj[key] = resolveUUIDs(obj[key]);
                return newObj;
            }
            return obj;
        };

        const resolvedActor = resolveUUIDs(actor);

        const systemInfo = await client.getSystem();
        let adapter = await getAdapter(systemInfo.id);

        if (!adapter || (adapter.match && !adapter.match(resolvedActor))) {
            adapter = await getMatchingAdapter(resolvedActor);
        }

        const normalizedActor = adapter.normalizeActorData(resolvedActor, client);

        if (adapter.computeActorData) {
            normalizedActor.derived = {
                ...(normalizedActor.derived || {}),
                ...adapter.computeActorData(normalizedActor)
            };
        }

        if (adapter.categorizeItems) {
            normalizedActor.categorizedItems = adapter.categorizeItems(normalizedActor);
        }

        if (normalizedActor.img) {
            normalizedActor.img = client.resolveUrl(normalizedActor.img);
        }
        if (normalizedActor.prototypeToken?.texture?.src) {
            normalizedActor.prototypeToken.texture.src = client.resolveUrl(normalizedActor.prototypeToken.texture.src);
        }

        return {
            ...normalizedActor,
            foundryUrl: client.url,
            systemId: adapter.systemId,
            debugLevel: deps.config.debug?.level ?? 1
        };
    };

    // Actor write operations and item mutation helpers.
    const createActor = async (client: any, actorData: any) => {
        if (actorData.items && Array.isArray(actorData.items)) {
            actorData.items.forEach((item: any) => {
                if (item.effects && Array.isArray(item.effects)) {
                    if (item.effects.length > 0 && typeof item.effects[0] === 'string') {
                        logger.warn(`Core Service | Clearing invalid string effects for ${item.name} during creation`);
                        item.effects = [];
                    }
                }

                if (item.system) {
                    for (const key of Object.keys(item.system)) {
                        if (Array.isArray(item.system[key]) && (item.system[key].length === 0 || typeof item.system[key][0] === 'string')) {
                            delete item.system[key];
                        }
                    }
                }
            });
        }

        logger.debug('Core Service | Create Actor:', actorData);
        const newActor = await client.createActor(actorData);
        if (!newActor) throw new Error('Failed to create actor');

        return { success: true, id: newActor._id || newActor.id, actor: newActor };
    };

    const deleteActor = async (client: any, actorId: string) => {
        await client.deleteActor(actorId);
        return { success: true };
    };

    const updateActor = async (client: any, actorId: string, payload: any) => {
        const result = await client.updateActor(actorId, payload);
        return { success: true, result };
    };

    // Roll orchestration with adapter-aware automated sequence fallback.
    const rollActor = async (client: any, actorId: string, payload: any) => {
        const { type, key, options } = payload;
        const actor = await client.getActor(actorId);
        if (!actor) return { error: 'Actor not found', status: 404 };

        const systemInfo = await client.getSystem();
        const adapter = await getAdapter(systemInfo.id);
        if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

        if (type === 'use-item') {
            let itemId = key;
            const isId = actor.items?.some((i: any) => (i._id || i.id) === key);
            if (!isId) {
                const allItems = [
                    ...(actor.items || []),
                    ...(actor.categorizedItems?.feats || []),
                    ...(actor.categorizedItems?.uncategorized || [])
                ];
                const found = allItems.find((i: any) => i.name === key);
                if (found) itemId = found._id || found.id;
            }
            const result = await client.useItem(actorId, itemId);
            return { success: true, result };
        }

        let rollData;
        if (type === 'formula') {
            rollData = { formula: key, label: 'Custom Roll' };
        } else {
            rollData = adapter.getRollData(actor, type, key, options);
        }

        if (!rollData) throw new Error('Cannot determine roll formula');

        if (rollData.isAutomated && typeof adapter.performAutomatedSequence === 'function') {
            const result = await adapter.performAutomatedSequence(client, actor, rollData, options);
            return { success: true, result, label: rollData.label };
        }

        if (!rollData.formula) {
            throw new Error(`No roll formula for type "${type}" key "${key}"`);
        }

        const speaker = options?.speaker || {
            actor: actor._id || actor.id,
            alias: actor.name
        };

        const result = await client.roll(rollData.formula, rollData.label, {
            rollMode: options?.rollMode,
            speaker,
            flags: rollData.flags
        });

        return { success: true, result, label: rollData.label };
    };

    const createActorItem = async (client: any, actorId: string, payload: any) => {
        const newItemId = await client.createActorItem(actorId, payload);
        return { success: true, id: newItemId };
    };

    const updateActorItem = async (client: any, actorId: string, payload: any) => {
        await client.updateActorItem(actorId, payload);
        return { success: true };
    };

    const deleteActorItem = async (client: any, actorId: string, itemId: string) => {
        if (!itemId) return { success: false, error: 'Missing itemId', status: 400 };
        await client.deleteActorItem(actorId, itemId);
        return { success: true };
    };

    // Unified update splitter for mixed actor/item patch payloads.
    const updateActorAndItems = async (client: any, actorId: string, body: any) => {
        const actorUpdates: any = {};
        const itemUpdates: Map<string, any> = new Map();

        let updatesToProcess: any = {};
        if (body.path !== undefined && body.value !== undefined) {
            updatesToProcess[body.path] = body.value;
        } else {
            updatesToProcess = body;
        }

        for (const [path, value] of Object.entries(updatesToProcess)) {
            if (path.startsWith('items.')) {
                const parts = path.split('.');
                if (parts.length >= 2) {
                    const itemId = parts[1];
                    const itemProp = parts.slice(2).join('.');
                    if (itemProp) {
                        if (!itemUpdates.has(itemId)) itemUpdates.set(itemId, {});
                        itemUpdates.get(itemId)![itemProp] = value;
                    }
                }
            } else {
                actorUpdates[path] = value;
            }
        }

        for (const [itemId, updates] of itemUpdates.entries()) {
            logger.debug(`Core Service | Routing update to item ${itemId}: ${JSON.stringify(updates)}`);
            await client.updateActorItem(actorId, { _id: itemId, ...updates });
        }

        if (Object.keys(actorUpdates).length > 0) {
            await client.updateActor(actorId, actorUpdates);
        }

        return { success: true };
    };

    return {
        listActors,
        getActorCards,
        getActorCardById,
        getActorById,
        createActor,
        deleteActor,
        updateActor,
        rollActor,
        createActorItem,
        updateActorItem,
        deleteActorItem,
        updateActorAndItems
    };
}
