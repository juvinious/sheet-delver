import express from 'express';
import type { AppConfig } from '@shared/interfaces';
import { logger } from '@shared/utils/logger';
import { getAdapter } from '@modules/registry/server';

interface ActorRouteDeps {
    normalizeActors: (actorList: any[], client: any) => Promise<any[]>;
    config: AppConfig;
}

export function registerActorRoutes(appRouter: express.Router, deps: ActorRouteDeps) {
    appRouter.get('/actors', async (req, res) => {
        try {
            const client = (req as any).foundryClient;

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter for ${systemInfo.id} not found`);

            const rawActors = await client.getActors();

            // Filter is handled by Foundry permission naturally for the user?
            // Yes, standard User can only see what they own/observe.
            // Client.getActors() returns what the socket gives.

            const normalize = async (actorList: any[]) => deps.normalizeActors(actorList, client);

            // We treat all returned actors as "visible"
            // Filter by ownership and type
            const currentUserId = client.userId;

            // DEBUG: Log actor types to identify NPC patterns
            const actorTypes = new Set(rawActors.map((a: any) => a.type));
            const actorFolders = new Set(rawActors.map((a: any) => a.folder).filter(Boolean));
            logger.info(`Core Service | Actor types found: ${Array.from(actorTypes).join(', ')}`);
            logger.info(`Core Service | Actor folders found: ${Array.from(actorFolders).join(', ')}`);
            // logger.info(`Core Service | Sample actor: ${JSON.stringify(rawActors[0] || {}).substring(0, 300)}`);

            // Owned actors (ownership level 3 = OWNER)
            const owned = rawActors.filter((a: any) =>
                a.ownership?.[currentUserId!] === 3 || a.ownership?.default === 3
            );

            // Observable actors (ownership level 1 or 2 = LIMITED/OBSERVER)
            // EXCLUDE NPCs/monsters - only show player characters
            const observable = rawActors.filter((a: any) => {
                const isOwned = owned.includes(a);
                if (isOwned) return false;

                const userPermission = a.ownership?.[currentUserId!] || a.ownership?.default || 0;
                const isObservable = userPermission >= 1; // LIMITED or OBSERVER

                // CRITICAL: Exclude NPCs - Systems often use 'npc', 'monster', or 'vehicle' types
                const actorType = (a.type || '').toLowerCase();
                const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';

                return isObservable && !isNPC;
            });

            // Also filter NPCs from owned list for non-GM users
            const ownedCharacters = owned.filter((a: any) => {
                const actorType = (a.type || '').toLowerCase();
                const isNPC = actorType === 'npc' || actorType === 'monster' || actorType === 'vehicle';
                return !isNPC;
            });

            logger.info(`Core Service | Filtered actors - Owned: ${ownedCharacters.length}, Observable: ${observable.length}, Total raw: ${rawActors.length}`);

            res.json({
                actors: await normalize(ownedCharacters), // Legacy field
                ownedActors: await normalize(ownedCharacters),
                readOnlyActors: await normalize(observable),
                system: systemInfo.id
            });
        } catch (error: any) {
            logger.error(`Core Service | Actors fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/cards', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter || !adapter.getActorCardData) {
                return res.json({});
            }

            const rawActors = await client.getActors();
            const cards: Record<string, any> = {};

            for (const actor of rawActors) {
                const id = actor._id || actor.id;
                cards[id] = adapter.getActorCardData(actor);
            }

            res.json(cards);
        } catch (error: any) {
            logger.error(`Core Service | Actor cards bulk fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/:id/card', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor || actor.error) {
                return res.status(actor?.error ? 503 : 404).json({ error: actor?.error || 'Actor not found' });
            }

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter || !adapter.getActorCardData) {
                return res.json({});
            }

            res.json(adapter.getActorCardData(actor));
        } catch (error: any) {
            logger.error(`Core Service | Actor card fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.get('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actor = await client.getActor(req.params.id);
            if (!actor || actor.error) {
                return res.status(actor?.error ? 503 : 404).json({ error: actor?.error || 'Actor not found' });
            }

            const { CompendiumCache } = await import('@core/foundry/compendium-cache');
            const cache = CompendiumCache.getInstance();
            // Note: CompendiumCache is now initialized by SessionManager on startup.

            // Recursively resolve UUIDs
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

            // Priority: Use the current world's system adapter to avoid cross-system contamination
            const systemInfo = await client.getSystem();
            let adapter = await getAdapter(systemInfo.id);

            // Fallback: If world adapter doesn't match this specific actor, try heuristic matching
            const { getMatchingAdapter } = await import('@modules/registry/server');
            if (!adapter || (adapter.match && !adapter.match(resolvedActor))) {
                adapter = await getMatchingAdapter(resolvedActor);
            }

            const normalizedActor = adapter.normalizeActorData(resolvedActor, client);

            // Call adapter.computeActorData if available (module-specific derived stats)
            if (adapter.computeActorData) {
                normalizedActor.derived = {
                    ...(normalizedActor.derived || {}),
                    ...adapter.computeActorData(normalizedActor)
                };
            }

            // Call adapter.categorizeItems if available (module-specific item grouping)
            if (adapter.categorizeItems) {
                normalizedActor.categorizedItems = adapter.categorizeItems(normalizedActor);
            }

            if (normalizedActor.img) {
                normalizedActor.img = client.resolveUrl(normalizedActor.img);
            }
            if (normalizedActor.prototypeToken?.texture?.src) {
                normalizedActor.prototypeToken.texture.src = client.resolveUrl(normalizedActor.prototypeToken.texture.src);
            }

            res.json({
                ...normalizedActor,
                foundryUrl: client.url,
                systemId: adapter.systemId,
                debugLevel: deps.config.debug?.level ?? 1
            });
        } catch (error: any) {
            logger.error(`Core Service | Actor detail fetch failed: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    });

    // Create new actor
    appRouter.post('/actors', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actorData = req.body;

            // Global Sanitization for items
            if (actorData.items && Array.isArray(actorData.items)) {
                actorData.items.forEach((item: any) => {
                    // 1. Top-level effects sanitization
                    if (item.effects && Array.isArray(item.effects)) {
                        if (item.effects.length > 0 && typeof item.effects[0] === 'string') {
                            logger.warn(`Core Service | Clearing invalid string effects for ${item.name} during creation`);
                            item.effects = [];
                        }
                    }

                    // 2. Remove problematic arrays in system
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

            // Handle potential error from socket
            if (!newActor) throw new Error('Failed to create actor');

            res.json({ success: true, id: newActor._id || newActor.id, actor: newActor });
        } catch (error: any) {
            logger.error(`Core Service | Create Actor failed: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            await client.deleteActor(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            const msg = error.message || error.toString();
            if (msg.toLowerCase().includes('permission')) {
                return res.json({ success: true, warning: 'Permission denied, actor may remain' });
            }
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.patch('/actors/:id', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const result = await client.updateActor(req.params.id, req.body);
            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/roll', async (req, res) => {
        try {
            const client = (req as any).foundryClient;

            const { type, key, options } = req.body;
            const actor = await client.getActor(req.params.id);
            if (!actor) return res.status(404).json({ error: 'Actor not found' });

            const systemInfo = await client.getSystem();
            const adapter = await getAdapter(systemInfo.id);
            if (!adapter) throw new Error(`Adapter ${systemInfo.id} not found`);

            if (type === 'use-item') {
                // key may be an item ID or an item name (from generic feat routing fallback)
                let itemId = key;
                const isId = actor.items?.some((i: any) => (i._id || i.id) === key);
                if (!isId) {
                    // Try to resolve by name across all item arrays
                    const allItems = [
                        ...(actor.items || []),
                        ...(actor.categorizedItems?.feats || []),
                        ...(actor.categorizedItems?.uncategorized || [])
                    ];
                    const found = allItems.find((i: any) => i.name === key);
                    if (found) itemId = found._id || found.id;
                }
                const result = await client.useItem(req.params.id, itemId);
                return res.json({ success: true, result });
            }

            let rollData;
            if (type === 'formula') {
                rollData = { formula: key, label: 'Custom Roll' };
            } else {
                rollData = adapter.getRollData(actor, type, key, options);
            }

            if (!rollData) throw new Error('Cannot determine roll formula');

            // Handle Automated Roll Sequences — adapter signals this via isAutomated: true.
            // All system-specific dispatch logic (feats, decoctions, etc.) lives in performAutomatedSequence.
            if (rollData.isAutomated && typeof adapter.performAutomatedSequence === 'function') {
                const result = await adapter.performAutomatedSequence(client, actor, rollData, options);
                return res.json({ success: true, result, label: rollData.label });
            }

            // Fallback: Standard formula roll — require a formula or abort
            if (!rollData.formula) {
                throw new Error(`No roll formula for type "${type}" key "${key}"`);
            }

            // Determine speaker
            const speaker = options?.speaker || {
                actor: actor._id || actor.id,
                alias: actor.name
            };

            const result = await client.roll(rollData.formula, rollData.label, {
                rollMode: options?.rollMode,
                speaker: speaker,
                flags: rollData.flags
            });
            res.json({ success: true, result, label: rollData.label });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    appRouter.post('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const newItemId = await client.createActorItem(req.params.id, req.body);
            res.json({ success: true, id: newItemId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.put('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            await client.updateActorItem(req.params.id, req.body);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.delete('/actors/:id/items', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const itemId = req.query.itemId as string;
            if (!itemId) return res.status(400).json({ success: false, error: 'Missing itemId' });
            await client.deleteActorItem(req.params.id, itemId);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    appRouter.post('/actors/:id/update', async (req, res) => {
        try {
            const client = (req as any).foundryClient;
            const actorId = req.params.id;
            const body = req.body;

            const actorUpdates: any = {};
            const itemUpdates: Map<string, any> = new Map();

            // Normalize body to an object of path-value pairs
            let updatesToProcess: any = {};
            if (body.path !== undefined && body.value !== undefined) {
                updatesToProcess[body.path] = body.value;
            } else {
                updatesToProcess = body;
            }

            // Split updates into Actor-level and Item-level
            for (const [path, value] of Object.entries(updatesToProcess)) {
                if (path.startsWith('items.')) {
                    const parts = path.split('.');
                    if (parts.length >= 2) {
                        const itemId = parts[1];
                        // Extract property path relative to item (e.g., "system.equipped")
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

            // 1. Process Item Updates
            for (const [itemId, updates] of itemUpdates.entries()) {
                logger.debug(`Core Service | Routing update to item ${itemId}: ${JSON.stringify(updates)}`);
                await client.updateActorItem(actorId, { _id: itemId, ...updates });
            }

            // 2. Process Actor Updates
            if (Object.keys(actorUpdates).length > 0) {
                await client.updateActor(actorId, actorUpdates);
            }

            res.json({ success: true });
        } catch (error: any) {
            logger.error(`Core Service | Actor/Item update failed: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
