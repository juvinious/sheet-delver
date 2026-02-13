import { NextResponse } from 'next/server';
import { getClient } from '../../../core/foundry/instance';
import { logger } from '../../../app/ui/logger';
import { getConfig } from '../../../core/config';
import { ShadowdarkAdapter } from '../system';
import { dataManager } from '../data/DataManager';
import { calculateAdvancement, assembleFinalItems, validateState } from './level-up-engine';
import * as levelUpEngine from './level-up-engine';
import { TALENT_HANDLERS } from './talent-handlers';
import { resolveBaggage } from './gear-resolver';

import { Roll } from '../../../core/foundry/classes/Roll';

/**
 * GET /api/shadowdark/actors/[id]/level-up/data
 * Fetch level-up data for the modal
 */
export async function handleGetLevelUpData(actorId: string | undefined, request: Request, client: any) {
    logger.info(`[API] handleGetLevelUpData | actorId: ${actorId} | url: ${request.url}`);
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        // 1. Fetch Request Query Params
        const url = new URL(request.url, getConfig().app.url);
        const classId = url.searchParams.get('classId');
        const patronId = url.searchParams.get('patronId');

        let actor = null;
        if (actorId && actorId !== 'undefined' && actorId !== 'null' && actorId !== 'new') {
            actor = await client.getActor(actorId);
        }

        const adapter = new ShadowdarkAdapter();
        const data = await adapter.getLevelUpData(client, actor, classId || undefined, patronId || undefined);

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
export async function handleRollHP(actorId: string | undefined, request: Request, client: any, userSession?: any) {
    logger.info(`[API] handleRollHP called for actorId: ${actorId}`);
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const body = await request.json();
        const { isReroll: _isReroll, classId } = body;

        let hitDie = '1d4';

        // 1. Try to fetch from actor if exists
        if (actorId && actorId !== 'new' && actorId !== 'undefined') {
            try {
                const actor = await client.getActor(actorId);
                const classItem = actor.items?.find((i: any) => i.type === 'Class');
                if (classItem && classItem.system && classItem.system.hitPoints) {
                    hitDie = classItem.system.hitPoints;
                }
            } catch { /* ignore */ }
        }

        // 2. Fallback: Use classId override if provided (e.g. for Level 1 creation)
        if (hitDie === '1d4' && classId) {
            try {
                logger.info(`[API] Fetching class doc for ${classId}`);
                const classDoc = await dataManager.getDocument(classId) || await client.fetchByUuid(classId);
                if (classDoc && classDoc.system && classDoc.system.hitPoints) {
                    hitDie = classDoc.system.hitPoints;
                    logger.info(`[API] Found hitDie from class doc: ${hitDie}`);
                }
            } catch (err) {
                logger.error(`[API] Error fetching class doc:`, err);
            }
        }

        logger.info(`[API] Using hitDie: ${hitDie}`);

        // IMPROVEMENT: Sanitize hitDie to ensure it's a formula, not just a number
        const str = String(hitDie).trim();
        if (/^\d+$/.test(str)) {
            // "4" -> "1d4"
            hitDie = `1d${str}`;
        } else if (/^d\d+$/i.test(str)) {
            // "d6" -> "1d6"
            hitDie = `1${str}`;
        }

        logger.info(`[API] Rolling HP with formula: ${hitDie}`);

        // Determine speaker override
        let speakerOverride = undefined;
        if (actorId && actorId !== 'new') {
            // Existing actor: use actor's name
            try {
                const actor = await client.getActor(actorId);
                if (actor) {
                    speakerOverride = {
                        actor: actor._id || actor.id,
                        alias: actor.name
                    };
                }
            } catch (e) {
                logger.warn(`[API] Could not fetch actor for speaker: ${e}`);
            }
        } else {
            // New character (generator): use player's name from userSession
            if (userSession?.username) {
                speakerOverride = {
                    alias: userSession.username
                };
            }
        }

        // Roll using Foundry Client (Socket)
        const chatMessage = await client.roll(hitDie, "Hit Point Roll (Level Up)", speakerOverride);

        if (!chatMessage) {
            throw new Error("Failed to execute roll via Foundry Client");
        }

        // Parse result from Chat Message
        // content is usually the total string
        let total = parseInt(chatMessage.content);

        // Fallback: Check rolls array
        if (isNaN(total) && chatMessage.rolls && chatMessage.rolls.length > 0) {
            try {
                // In v12/v13 rolls might be JSON strings or objects
                const rollData = typeof chatMessage.rolls[0] === 'string'
                    ? JSON.parse(chatMessage.rolls[0])
                    : chatMessage.rolls[0];
                total = rollData.total;
            } catch (e) {
                logger.warn(`[API] Failed to parse roll data from message: ${e}`);
            }
        }

        // Shadowdark Rule: Minimum 1 HP gain (safe guard, though usually 1dX >= 1)
        total = Math.max(1, total || 0);

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
        logger.error('[API] Roll HP Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to roll HP' }, { status: 500 });
    }
}

export async function handleRollGold(actorId: string | undefined, request: Request, client: any, userSession?: any) {
    if (!client || !client.isConnected) {
        return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
    }

    // Shadowdark Standard Gold: 2d6 * 5
    const multiplier = 5;
    const dice = "2d6";
    const formula = `${dice} * ${multiplier}`;

    try {
        logger.info(`[API] Rolling Gold with formula: ${formula}`);

        // Determine speaker override
        let speakerOverride = undefined;
        if (actorId && actorId !== 'new') {
            // Existing actor: use actor's name
            try {
                const actor = await client.getActor(actorId);
                if (actor) {
                    speakerOverride = {
                        actor: actor._id || actor.id,
                        alias: actor.name
                    };
                }
            } catch (e) {
                logger.warn(`[API] Could not fetch actor for speaker: ${e}`);
            }
        } else {
            // New character (generator): use player's name from userSession
            if (userSession?.username) {
                speakerOverride = {
                    alias: userSession.username
                };
            }
        }

        // Roll using Foundry Client (Socket)
        const chatMessage = await client.roll(formula, "Starting Gold Roll", speakerOverride);

        if (!chatMessage) {
            throw new Error("Failed to execute gold roll via Foundry Client");
        }

        // Parse result from Chat Message
        let total = parseInt(chatMessage.content);

        // Fallback: Check rolls array
        if (isNaN(total) && chatMessage.rolls && chatMessage.rolls.length > 0) {
            try {
                const rollData = typeof chatMessage.rolls[0] === 'string'
                    ? JSON.parse(chatMessage.rolls[0])
                    : chatMessage.rolls[0];
                total = rollData.total;
            } catch (e) {
                logger.warn(`[API] Failed to parse gold roll data: ${e}`);
            }
        }

        return NextResponse.json({ success: true, roll: { total } });
    } catch (e: any) {
        logger.error("Gold Roll Failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/roll-talent
 */
export async function handleRollTalent(actorId: string | undefined, request: Request, client: any) {
    try {
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const body = await request.json();
        const { tableUuidOrName, targetLevel } = body;

        if (!tableUuidOrName) {
            return NextResponse.json({ error: 'tableUuidOrName is required' }, { status: 400 });
        }

        // Pre-fetch actor items if checking for duplicates
        const existingTalentNames = new Set<string>();
        if (actorId && actorId !== 'new') {
            try {
                const actor = await client.getActor(actorId);
                if (actor && actor.items) {
                    actor.items.forEach((i: any) => {
                        if (i.type === 'Talent' || i.type === 'Boon') {
                            existingTalentNames.add(i.name.toLowerCase().trim());
                        }
                    });
                }
            } catch (e) {
                logger.warn(`[API] Could not fetch actor items for duplicate check: ${e}`);
            }
        }

        const instructionRegex = /\breroll\b|\balready\s+taken\b|\balready\s+had\b/i;

        let attempts = 0;
        const maxAttempts = 5;
        let finalRollResult = null;
        let item = null;
        let needsChoice = false;
        let choiceOptions: any[] = [];

        while (attempts < maxAttempts) {
            attempts++;
            const result = await dataManager.rollTable(tableUuidOrName);
            if (!result) {
                return NextResponse.json({ error: `RollTable not found: ${tableUuidOrName}` }, { status: 404 });
            }

            finalRollResult = result;
            const processed = await levelUpEngine.processRollResult({
                result,
                table: result.table
            });

            item = processed.item;
            needsChoice = processed.needsChoice;
            choiceOptions = processed.choiceOptions;

            if (needsChoice) break; // Choices are filtered in getChoices()

            if (item) {
                const itemName = (item.name || item.text || item.description || "").toLowerCase().trim();

                // Check for reroll instruction
                if (instructionRegex.test(itemName)) {
                    logger.info(`[API] Explicit reroll instruction hit: "${itemName}". Attempt ${attempts}/${maxAttempts}`);
                    continue;
                }

                // Check for duplicate
                if (existingTalentNames.has(itemName)) {
                    logger.info(`[API] Duplicate talent hit: "${itemName}". Attempt ${attempts}/${maxAttempts}`);
                    continue;
                }

                // Valid non-duplicate item
                break;
            } else {
                logger.info(`[API] Empty or instruction result. Attempt ${attempts}/${maxAttempts}`);
                continue;
            }
        }

        if (item) {
            // Apply mutation handlers
            for (const handler of TALENT_HANDLERS) {
                if (handler.matches(item)) {
                    // check for onRoll side effects that might force a choice
                    if (handler.onRoll) {
                        const block = handler.onRoll({ item, targetLevel });
                        if (block === true) {
                            needsChoice = true;
                            // If handler forces choice but we don't have options yet, fetch them
                            if (!choiceOptions || choiceOptions.length === 0) {
                                choiceOptions = finalRollResult ? levelUpEngine.getChoices(finalRollResult.table) : [];
                            }
                        }
                    }
                }
            }

            // Normalize Name (Frontend expects .name)
            if (!item.name && (item.text || item.description)) {
                item.name = item.text || item.description;
            }
        }

        return NextResponse.json({
            success: true,
            roll: finalRollResult?.total,
            formula: finalRollResult?.formula,
            item: item,
            needsChoice,
            choiceOptions
        });

    } catch (error: any) {
        logger.error('[API] Roll Talent Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to roll talent' }, { status: 500 });
    }
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/roll-boon
 */
export async function handleRollBoon(actorId: string | undefined, request: Request, client: any) {
    // Similar to talent but for boons
    return handleRollTalent(actorId, request, client);
}

/**
 * POST /api/shadowdark/actors/[id]/level-up/resolve-choice
 */
export async function handleResolveChoice(actorId: string | undefined, request: Request, client: any) {
    try {
        const body = await request.json();
        const { type, selection } = body;

        // Implementation for resolving specific choices (Weapon Mastery, etc)
        // This might just return structured data for the frontend to store until finalize
        return NextResponse.json({ success: true, selection });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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

        let actor = null;
        if (actorId && actorId !== 'new') {
            actor = await client.getActor(actorId);
            if (!actor) return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
        }

        // Backend assembly and validation
        const classObj = body.classObj || (body.classUuid ? (await dataManager.getDocument(body.classUuid) || await client.fetchByUuid(body.classUuid)) : null);
        const ancestry = body.ancestryObj || (body.ancestryUuid ? (await dataManager.getDocument(body.ancestryUuid) || await client.fetchByUuid(body.ancestryUuid)) : null);

        const state = {
            rolledTalents: body.rolledTalents || [],
            rolledBoons: body.rolledBoons || [],
            selectedSpells: body.selectedSpells || [],
            selectedLanguages: body.languages || [],
            hpRoll: body.hpRoll,
            goldRoll: gold,
            statSelection: body.statSelection || { required: 0, selected: [] },
            statPool: body.statPool || { total: 0, allocated: {}, talentIndex: null },
            weaponMasterySelection: body.weaponMasterySelection || { required: 0, selected: [] },
            armorMasterySelection: body.armorMasterySelection || { required: 0, selected: [] },
            extraSpellSelection: body.extraSpellSelection || { active: false, maxTier: 0, source: '', selected: [] }
        };

        const targetLevel = body.targetLevel || (actor?.system?.level?.value || 0) + 1;

        // Assembly
        const finalItems = await assembleFinalItems(state, targetLevel, classObj, ancestry, client);

        const actorUpdates: any = {};
        if (actor && actorId !== 'new') {
            if (state.hpRoll !== undefined && state.hpRoll !== null) {
                const currentMax = actor.system?.attributes?.hp?.max || 0;
                const currentVal = actor.system?.attributes?.hp?.value || 0;
                const newMax = currentMax + state.hpRoll;
                const newVal = currentVal + state.hpRoll;

                actorUpdates['system.attributes.hp.max'] = newMax;
                actorUpdates['system.attributes.hp.value'] = newVal;
            }

            actorUpdates['system.level.value'] = targetLevel;

            if (gold !== undefined && gold !== null) {
                const currentCoins = actor.system?.coins?.gp || 0;
                actorUpdates['system.coins.gp'] = currentCoins + gold;
            }

            if (state.selectedLanguages && Array.isArray(state.selectedLanguages)) {
                const currentLangs = actor.system?.languages || [];
                const newLangs = Array.from(new Set([...currentLangs, ...state.selectedLanguages]));
                actorUpdates['system.languages'] = newLangs;
            }

            if (Object.keys(actorUpdates).length > 0) {
                logger.info(`[API] Updating actor ${actorId} with: ${JSON.stringify(actorUpdates)}`);
                await client.updateActor(actorId, actorUpdates);
            }

            if (finalItems.length > 0) {
                logger.info(`[API] Creating ${finalItems.length} items for actor ${actorId}`);
                await client.createActorItem(actorId, finalItems);
            }
        }

        return NextResponse.json({
            success: true,
            actorId,
            items: finalItems,
            updates: actorUpdates,
            hpRoll: state.hpRoll,
            goldRoll: gold
        });

    } catch (error: any) {
        logger.error('[API] Finalize Level-Up Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to finalize level-up' }, { status: 500 });
    }
}
