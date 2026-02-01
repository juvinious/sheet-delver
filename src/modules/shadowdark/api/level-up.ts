
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';
import { dataManager } from '../data/DataManager';

/**
 * GET /api/shadowdark/actors/[id]/level-up/data
 * Fetch level-up data for the modal
 */
export async function handleGetLevelUpData(actorId: string | undefined, request?: Request) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // Get optional params from request URL
        let queryClassUuid: string | undefined;
        if (request) {
            const url = new URL(request.url);
            queryClassUuid = url.searchParams.get('classId') || undefined;
        }

        // 1. Fetch Minimal Actor Data from Foundry
        // 1. Fetch Minimal Actor Data from Foundry
        const actor = await client.getActor(actorId || '');
        if (!actor) {
            return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
        }

        const currentLevel = actor.system?.level?.value || 0;
        const targetLevel = currentLevel + 1;
        const currentXP = actor.system?.level?.xp || 0;
        // Prefer queryClassUuid if provided
        const classUuid = queryClassUuid || actor.system?.class;
        const patronUuid = actor.system?.patron;
        const conMod = actor.system?.abilities?.con?.mod || 0;

        const actorData = {
            actorId,
            currentLevel,
            targetLevel,
            currentXP,
            classUuid,
            patronUuid,
            conMod
        };

        if ('error' in actorData) {
            return NextResponse.json({ error: actorData.error }, { status: 404 });
        }

        // 2. Try to resolve Data locally (Fast Path)
        // 2. Try to resolve Data locally (Fast Path)
        const classDoc = classUuid ? await dataManager.getDocument(classUuid) : null;
        const patronDoc = patronUuid ? await dataManager.getDocument(patronUuid) : null;

        // If we have the class doc (or don't need one), we can proceed locally
        if (classDoc || !classUuid) {
            // console.log('[API] Fast Path: Using cached data for', classDoc?.name);

            const talentGained = targetLevel % 2 !== 0; // Odd levels

            const isSpellcaster = Boolean(
                classDoc?.system?.spellcasting?.class ||
                classDoc?.system?.spellcasting?.ability
            );

            const spellsToChoose: Record<number, number> = {};
            let availableSpells: any[] = [];

            if (isSpellcaster) {
                if (classDoc?.system?.spellcasting?.spellsknown) {
                    const skTable = classDoc.system.spellcasting.spellsknown;
                    const currentSpells = skTable[String(currentLevel)] || skTable[currentLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    const targetSpells = skTable[String(targetLevel)] || skTable[targetLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                    for (let tier = 1; tier <= 5; tier++) {
                        const tStr = String(tier);
                        const targetVal = targetSpells[tStr] ?? targetSpells[tier] ?? 0;
                        const currentVal = currentSpells[tStr] ?? currentSpells[tier] ?? 0;
                        const diff = targetVal - currentVal;
                        if (diff > 0) {
                            spellsToChoose[tier] = diff;
                        }
                    }
                }

                // Get Spells from Cache
                if (classDoc?.name) {
                    availableSpells = await dataManager.getSpellsBySource(classDoc.name);
                }
            }

            const data = {
                success: true,
                actorId,
                currentLevel,
                targetLevel,
                currentXP,
                talentGained,
                classHitDie: classDoc?.system?.hitPoints || '1d4',
                classTalentTable: classDoc?.system?.classTalentTable,
                patronBoonTable: patronDoc?.system?.boonTable,
                canRollBoons: classDoc?.system?.patron?.required || false,
                startingBoons: (targetLevel === 1 && classDoc?.system?.patron?.startingBoons) || 0,
                isSpellcaster,
                spellsToChoose,
                availableSpells,
                conMod,
            };
            return NextResponse.json({ success: true, data });
        }

        // 3. Fallback to Foundry (Slow Path)
        // Used if Class/Patron are custom items not in our cache
        console.log('[API] Slow Path: Fetching full data from Foundry for', classUuid);
        // 3. Fallback to Foundry (Slow Path)
        // Used if Class/Patron are custom items not in our cache
        console.log('[API] Slow Path: Fetching full data from Foundry for', classUuid);
        return NextResponse.json({ error: 'Fetching uncached Class/Patron data from Foundry is not supported in Socket mode. Please ensure Compendiums are synced.' }, { status: 501 });

        /*
        const data = await client.page!.evaluate(async ({ actorId, queryClassUuid }) => {
            // ... implementation ...
        }, { actorId, queryClassUuid });
        
        // ...
        */

        return NextResponse.json({ success: true, data: actorData });

    } catch (error: any) {
        console.error('[API] Level-Up Data Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch level-up data' }, { status: 500 });
    }
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/roll-hp
 * Roll HP for level-up
 */
export async function handleRollHP(actorId: string | undefined, request: Request) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { isReroll: _isReroll, classId: _classId } = await request.json(); // Unused properties

        // Determines Hit Die based on Class or actor data
        // For simplicity in Headless mode, we default to 1d6 if class not found, or user must provide it?
        // Actually, we can just roll the formula if provided, or default.
        // But we need the formula.
        // We can't easily resolve Class Item from UUID via Socket without cache.
        // Let's assume '1d6' if unknown for now, or error?
        // Wait, earlier logic fetched classDoc via fromUuid.
        // We can't do that.
        // But we can check if actor has class item using getActor which we could call?
        // But getActor was not called here.
        // Let's just use a simple default or fail if logic is complex.
        // Actually, we can fetch actor data to find class!

        let hitDie = '1d4';
        if (actorId) {
            try {
                const actor = await client.getActor(actorId);
                if (actor && actor.system) {
                    // const classUuid = actor.system.class; // Unused
                    // We can't resolve UUID. But maybe actor has class item embedded?
                    const classItem = actor.items?.find((i: any) => i.type === 'Class');
                    if (classItem && classItem.system && classItem.system.hitPoints) {
                        hitDie = classItem.system.hitPoints;
                    }
                }
            } catch { console.error('Error fetching actor for HP Roll:'); }
        }

        // Roll
        const result = await client.roll(hitDie, `Hit Point Roll (Level Up)`);

        // Result from client.roll might need normalization? 
        // client.roll returns Promise<any>. In SocketClient it returns result of evaluate which is null/warn?
        // WAIT. SocketClient.roll logic:
        // emit('roll', ...)
        // It DOES NOT Return the total!
        // The implementation in SocketClient.ts:
        // async roll(formula, flavor) { ... this.emit('modifyDocument', { type: 'ChatMessage', ... }) ... }
        // It returns the created ChatMessage document!
        // The ChatMessage document has .rolls array.
        // So I can get the total from there.

        if (!result) throw new Error('Roll failed');
        // result is [messageData]
        // const _msg = Array.isArray(result) ? result[0] : result; // Unused
        // In Foundry v10+, rolls are serialized in 'rolls' array. 
        // We need to parse it? Or is it already JSON?
        // 'rolls' in JSON are strings usually.
        // But wait, SocketClient uses `operation: { action: 'create' }`.

        // If I can't easily extract the total from the ChatMessage JSON without a Roll parser,
        // then I can't return { total } to the UI.
        // The UI needs the total to update the sheet!

        // Workaround: Use a simple local dice roller since we are headless?
        // But we want it to show in Foundry chat?
        // We can do BOTH. Roll locally, then send Chat Message with the result.
        // But ensuring fairness/integrity usually implies server-side or Foundry-side rolling.
        // If I send a Chat Message with "content": "Rolled 5", it works.
        // But the UI needs the value.

        // Let's use a simple local roll for the value, and send a chat message.
        // That effectively "rolls" for the user.

        // Simple dice parser? 
        const parts = hitDie.split('d');
        const count = parseInt(parts[0]) || 1;
        const faces = parseInt(parts[1]) || 4;
        let total = 0;
        for (let i = 0; i < count; i++) total += Math.floor(Math.random() * faces) + 1;

        // Send Chat Message
        await client.sendMessage({
            content: `Hit Point Roll (Level Up): ${total} (${hitDie})`,
            type: 1, // OOC
            speaker: { actor: actorId }
        });

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

export async function handleRollGold(actorId: string | undefined, request: Request) {
    const client = getClient();
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
    }

    // const { isReroll: _isReroll, classId: _classId } = await request.json(); // Unused

    // Shadowdark Standard Gold: 2d6 * 5
    const multiplier = 5;
    const dice = "2d6";

    // Simple local roll
    let rTotal = 0;
    for (let i = 0; i < 2; i++) rTotal += Math.floor(Math.random() * 6) + 1;
    const total = rTotal * multiplier;

    // Send Chat Message
    await client.sendMessage({
        content: `Starting Gold Roll (Level 1): ${total} (${dice} * ${multiplier})`,
        type: 1, // OOC
        speaker: { actor: actorId }
    });

    const result = {
        total: total,
        formula: `${dice} x ${multiplier}`,
        breakdown: `${rTotal} x ${multiplier}`
    };

    return NextResponse.json({ success: true, roll: result });
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/finalize
 * Finalize level-up and apply changes
 */
export async function handleFinalizeLevelUp(actorId: string, request: Request) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // const { hpRoll: _hpRoll, items: _items, languages: _languages } = await request.json(); // Unused

        return NextResponse.json({ error: 'Finalizing level-up is not supported in Socket mode yet.' }, { status: 501 });

        /*
        const result = await client.page!.evaluate(async ({ actorId, hpRoll, items, languages }) => {
             // ... implementation ...
          const { _hpRoll, _items, _languages } = data;
        */

        return NextResponse.json({ success: true, actor: {} });

    } catch (error: any) {
        console.error('[API] Finalize Level-Up Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to finalize level-up' }, { status: 500 });
    }
}
