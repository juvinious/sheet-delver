import { NextResponse } from 'next/server';
import { getClient } from '../../../core/foundry/instance';
import { logger } from '../../../app/ui/logger';
import { getConfig } from '../../../core/config';
import { ShadowdarkAdapter } from '../system';

/**
 * GET /api/shadowdark/actors/[id]/level-up/data
 * Fetch level-up data for the modal
 */
export async function handleGetLevelUpData(actorId: string | undefined, client: any) {
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // 1. Fetch Request Query Params (for classId override) if passed?
        // Current signature doesn't pass request object for params, relying on client injection.
        // We might need to update server.ts to pass query params or handle it here if Request was passed.
        // Ideally server.ts should pass necessary data.
        // For now, let's rely on actor data or update server.ts to pass classUuid.
        // But since I can't easily change the signature without changing server.ts first/simultaneously,
        // and I am doing this step-by-step.

        // I will assume for now we use actor's class. 
        // If we need query param support, we should have updated server.ts to pass it.
        // Actually, the server.ts update is next. I can update this signature to accept optional classUuid.

        // Let's assume the signature will be: (actorId, client, classUuidOverride?)
        // But I need to write the file with *current* assumption or planned one.
        // I will stick to the plan: use Adapter.

        const actor = await client.getActor(actorId || '');
        if (!actor) {
            return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
        }

        const adapter = new ShadowdarkAdapter();
        // We don't have classUuid param here yet, pass undefined.
        const data = await adapter.getLevelUpData(client, actor);

        return NextResponse.json({ success: true, data });

    } catch (error: any) {
        logger.error('[API] Level-Up Data Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch level-up data' }, { status: 500 });
    }
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/roll-hp
 * Roll HP for level-up
 */
export async function handleRollHP(actorId: string | undefined, request: Request, client: any) {
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { isReroll: _isReroll } = await request.json();

        let hitDie = '1d4';
        if (actorId) {
            try {
                const actor = await client.getActor(actorId);
                // Try to find Class item for Hit Die
                const classItem = actor.items?.find((i: any) => i.type === 'Class');
                if (classItem && classItem.system && classItem.system.hitPoints) {
                    hitDie = classItem.system.hitPoints;
                }
            } catch { console.error('Error fetching actor for HP Roll:'); }
        }

        // Roll
        const result = await client.roll(hitDie, `Hit Point Roll (Level Up)`, actorId);

        if (!result) throw new Error('Roll failed');

        // client.roll returns the ChatMessage document. 
        // In our implementation, content contains the total as a string.
        const total = parseInt(result.content) || 0;

        return NextResponse.json({
            success: true,
            formula: hitDie,
            total: total,
            roll: {
                total,
                formula: hitDie,
                isReroll: _isReroll || false
            }
        });

    } catch (error: any) {
        console.error('[API] Roll HP Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to roll HP' }, { status: 500 });
    }
}

export async function handleRollGold(actorId: string | undefined, request: Request, client: any) {
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
    }

    // Shadowdark Standard Gold: 2d6 * 5
    // Shadowdark Standard Gold: 2d6 * 5
    const multiplier = 5;
    const dice = "2d6";
    const formula = `${dice} * ${multiplier}`;

    try {
        const result = await client.roll(formula, `Starting Gold Roll (Level 1)`, actorId);

        if (!result) throw new Error('Roll failed');

        // client.roll returns ChatMessage. content is total.
        const total = parseInt(result.content) || 0;

        return NextResponse.json({ success: true, roll: { total } });
    } catch (e: any) {
        console.error("Gold Roll Failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }

}

/**
 * POST /api/shadowdark/actors/[id]/level-up/finalize
 * Finalize level-up and apply changes
 */
export async function handleFinalizeLevelUp(actorId: string, request: Request, client: any) {
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const body = await request.json();
        const { hpRoll, items, languages, gold } = body;

        logger.info(`[API] Finalizing Level Up for ${actorId} -> Level ${body.targetLevel || 'Unknown'}`);

        const actor = await client.getActor(actorId);
        if (!actor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });

        const actorUpdates: any = {};

        if (hpRoll !== undefined) {
            const currentMax = actor.system?.attributes?.hp?.max || 0;
            const currentVal = actor.system?.attributes?.hp?.value || 0;
            const newMax = currentMax + hpRoll;
            const newVal = currentVal + hpRoll;

            actorUpdates['system.attributes.hp.max'] = newMax;
            actorUpdates['system.attributes.hp.value'] = newVal;
        }

        const currentLevel = actor.system?.level?.value || 0;
        actorUpdates['system.level.value'] = currentLevel + 1;

        if (gold !== undefined) {
            const currentCoins = actor.system?.coins?.gp || 0;
            actorUpdates['system.coins.gp'] = currentCoins + gold;
        }

        if (languages && Array.isArray(languages)) {
            const currentLangs = actor.system?.languages || [];
            const newLangs = Array.from(new Set([...currentLangs, ...languages]));
            actorUpdates['system.languages'] = newLangs;
        }

        if (Object.keys(actorUpdates).length > 0) {
            logger.info(`[API] Updating actor ${actorId} with: ${JSON.stringify(actorUpdates)}`);
            await client.updateActor(actorId, actorUpdates);
        }

        if (items && Array.isArray(items) && items.length > 0) {
            logger.info(`[API] Creating ${items.length} items for actor ${actorId}`);
            try {
                await client.createActorItem(actorId, items);
            } catch (err: any) {
                logger.error(`[API] Failed to create items: ${err.message}`, err);
                throw err;
            }
        }

        return NextResponse.json({ success: true, actorId });

    } catch (error: any) {
        console.error('[API] Finalize Level-Up Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to finalize level-up' }, { status: 500 });
    }
}
