
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

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

        const data = await client.page!.evaluate(async ({ actorId, queryClassUuid }) => {
            let currentLevel = 0;
            let targetLevel = 1;
            let currentXP = 0;
            let classUuid = queryClassUuid;
            let patronUuid = null;
            let actor = null;
            let conMod = 0;

            if (actorId) {
                // @ts-ignore
                actor = window.game.actors.get(actorId);
                if (!actor) return { error: 'Actor not found' };
                currentLevel = actor.system?.level?.value || 0;
                targetLevel = currentLevel + 1;
                currentXP = actor.system?.level?.xp || 0;
                // Prefer queryClassUuid if provided (e.g. selecting class for Lvl 1), otherwise actor's class
                classUuid = queryClassUuid || actor.system?.class;
                patronUuid = actor.system?.patron;
                conMod = actor.system?.abilities?.con?.mod || 0;
            } else {
                // New Character Mode
                // Defaults: Level 0 -> 1
            }

            // Get class document
            // @ts-ignore
            const classDoc = classUuid ? await fromUuid(classUuid) : null;

            // Determine if talent is gained (odd levels)
            const talentGained = targetLevel % 2 !== 0;

            // Get patron if applicable
            // @ts-ignore
            const patronDoc = patronUuid ? await fromUuid(patronUuid) : null;

            // Check if spellcaster
            const isSpellcaster = Boolean(
                classDoc?.system?.spellcasting?.class ||
                classDoc?.system?.spellcasting?.ability
            );
            console.log(`[LevelUpAPI] Class: ${classDoc?.name} (${classUuid}), isSpellcaster: ${isSpellcaster}, CurLvl: ${currentLevel}, TgtLvl: ${targetLevel}`);

            // Calculate spell slots to fill
            const spellsToChoose: Record<number, number> = {};
            let availableSpells: any[] = [];

            if (isSpellcaster) {
                // Calculate slots
                if (classDoc?.system?.spellcasting?.spellsknown) {
                    const skTable = classDoc.system.spellcasting.spellsknown;
                    // console.log(`[LevelUpAPI] SK Table:`, JSON.stringify(skTable));

                    // Parse table effectively
                    const currentSpells = skTable[String(currentLevel)] || skTable[currentLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    const targetSpells = skTable[String(targetLevel)] || skTable[targetLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                    console.log(`[LevelUpAPI] Spells Known Check - Current (${currentLevel}):`, currentSpells, "Target (" + targetLevel + "):", targetSpells);

                    for (let tier = 1; tier <= 5; tier++) {
                        const tStr = String(tier);
                        const targetVal = targetSpells[tStr] ?? targetSpells[tier] ?? 0;
                        const currentVal = currentSpells[tStr] ?? currentSpells[tier] ?? 0;
                        const diff = targetVal - currentVal;
                        if (diff > 0) {
                            spellsToChoose[tier] = diff;
                        }
                    }
                    console.log(`[LevelUpAPI] Calculated spellsToChoose:`, spellsToChoose);
                } else {
                    console.warn(`[LevelUpAPI] No spellsknown table found for ${classDoc?.name}`);
                }

                // Fetch available spells using official system method
                // @ts-ignore
                if (window.shadowdark?.compendiums?.classSpellBook) {
                    // @ts-ignore
                    const spells = await window.shadowdark.compendiums.classSpellBook(classUuid);
                    console.log(`[LevelUpAPI] classSpellBook returned ${spells?.length} spells`);

                    // Handle cases where spells might be plain objects or Documents
                    availableSpells = spells.map((s: any) => {
                        if (typeof s.toJSON === 'function') return s.toJSON();
                        return s;
                    });
                } else {
                    console.warn(`[LevelUpAPI] window.shadowdark.compendiums.classSpellBook missing`);
                }
            }

            return {
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
        }, { actorId, queryClassUuid });

        if ('error' in data) {
            return NextResponse.json({ error: data.error }, { status: 404 });
        }

        return NextResponse.json({ success: true, data });

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

        const { isReroll, classId } = await request.json();

        const result = await client.page!.evaluate(async ({ actorId, classId }) => {
            let hitDie = '1d4';
            let actor = null;


            // Prioritize classId if provided (for level-up scenarios where target class differs from current)
            if (classId) {
                // Get class hit die from class ID directly
                // @ts-ignore
                const classDoc = await fromUuid(classId);
                if (classDoc?.system?.hitPoints) hitDie = classDoc.system.hitPoints;

                // Get actor if provided (for chat message)
                if (actorId) {
                    // @ts-ignore
                    actor = window.game.actors.get(actorId);
                }
            } else if (actorId) {
                // Fallback: use actor's current class if no classId provided
                // @ts-ignore
                actor = window.game.actors.get(actorId);
                const classUuid = actor?.system?.class;
                // @ts-ignore
                const classDoc = classUuid ? await fromUuid(classUuid) : null;
                if (classDoc?.system?.hitPoints) hitDie = classDoc.system.hitPoints;
            }


            // Roll HP using Foundry's Roll class
            // @ts-ignore
            const roll = new Roll(hitDie);
            await roll.evaluate();

            // Create a chat message for the roll
            // @ts-ignore
            await roll.toMessage({
                // @ts-ignore
                speaker: actor ? window.ChatMessage.getSpeaker({ actor }) : window.ChatMessage.getSpeaker(),
                flavor: `Hit Point Roll (Level Up)`
            });

            return {
                success: true,
                formula: hitDie,
                total: roll.total
            };
        }, { actorId, classId });

        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            roll: {
                ...result,
                isReroll: isReroll || false
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

    const { isReroll, classId } = await request.json();

    const result = await client.page!.evaluate(async ({ actorId, classId }) => {
        // Shadowdark Standard Gold: 2d6 * 5
        let multiplier = 5;
        let dice = "2d6";
        let actor = null;

        if (actorId) {
            // @ts-ignore
            actor = window.game.actors.get(actorId);
        }

        // @ts-ignore
        const r = new Roll(dice);
        await r.evaluate();
        const total = r.total * multiplier;

        // Create a chat message for the roll
        // @ts-ignore
        await r.toMessage({
            // @ts-ignore
            speaker: actor ? window.ChatMessage.getSpeaker({ actor }) : window.ChatMessage.getSpeaker(),
            flavor: `Starting Gold Roll (Level 1) - ${r.total} × ${multiplier}`
        });

        return {
            total: total,
            formula: `${dice} x ${multiplier}`,
            breakdown: `${r.total} x ${multiplier}`
        };
    }, { actorId, classId });

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

        const { hpRoll, items } = await request.json();

        const result = await client.page!.evaluate(async ({ actorId, hpRoll, items }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return { error: 'Actor not found' };

            const currentLevel = actor.system?.level?.value || 0;
            const targetLevel = currentLevel + 1;
            const currentXP = actor.system?.level?.xp || 0;

            // Calculate new XP (carryover)
            let newXP = 0;
            if (currentLevel > 0) {
                newXP = currentXP - (currentLevel * 10);
            }

            let createdItems: any[] = [];

            // Add items first (they may include HP/CON bonuses)
            if (items && items.length > 0) {
                console.log('[API] Finalize Items:', items.map((i: any) => `${i.name} (${i.type})`));

                // If we are adding a Class, remove any existing Class items first (e.g. replacing Level 0)
                const newClassItem = items.find((i: any) => i.type?.toLowerCase() === 'class');
                if (newClassItem) {
                    console.log('[API] New Class detected, removing existing classes...');
                    const existingClasses = actor.items.filter((i: any) => i.type?.toLowerCase() === 'class');
                    console.log('[API] Existing Classes found:', existingClasses.map((i: any) => i.name));

                    if (existingClasses.length > 0) {
                        const idsToDelete = existingClasses.map((i: any) => i.id);
                        await actor.deleteEmbeddedDocuments('Item', idsToDelete);
                    }
                }

                createdItems = await actor.createEmbeddedDocuments('Item', items);
            }

            // Calculate new HP
            let newBaseHP = (actor.system?.attributes?.hp?.base || 0) + hpRoll;
            let newValueHP = (actor.system?.attributes?.hp?.value || 0) + hpRoll;
            const hpBonus = actor.system?.attributes?.hp?.bonus || 0;
            let newMaxHP = newBaseHP + hpBonus;

            // Special handling for level 1: apply CON modifier
            if (targetLevel === 1) {
                const conMod = actor.system?.abilities?.con?.mod || 0;
                const hpWithCon = hpRoll + conMod;
                newBaseHP = Math.max(1, hpWithCon); // Minimum 1 HP
                newValueHP = newBaseHP + hpBonus;
                newMaxHP = newValueHP;
            }

            // Create audit log entry
            const auditLog = actor.system?.auditlog || {};
            const itemNames = items?.map((i: any) => i.name) || [];
            auditLog[targetLevel] = {
                baseHP: newBaseHP,
                itemsGained: itemNames,
            };

            // Update system links (Class, Patron) to point to the new items
            const newClass = createdItems.find((i: any) => i.type?.toLowerCase() === 'class');
            const newPatron = createdItems.find((i: any) => i.type?.toLowerCase() === 'patron');

            const updates: any = {
                'system.attributes.hp.base': newBaseHP,
                'system.attributes.hp.max': newMaxHP,
                'system.attributes.hp.value': newValueHP,
                'system.auditLog': auditLog,
                'system.level.value': targetLevel,
                'system.level.xp': newXP,
            };

            if (newClass) {
                // Ensure we have a valid UUID for the link
                const classUuid = newClass.uuid || `Actor.${actor.id}.Item.${newClass.id || newClass._id}`;
                console.log('[API] Linking new Class:', newClass.name, classUuid);
                updates['system.class'] = classUuid;
            }
            if (newPatron) {
                const patronUuid = newPatron.uuid || `Actor.${actor.id}.Item.${newPatron.id || newPatron._id}`;
                console.log('[API] Linking new Patron:', newPatron.name, patronUuid);
                updates['system.patron'] = patronUuid;
            }

            await actor.update(updates);

            return {
                success: true,
                level: targetLevel,
                xp: newXP,
                hp: {
                    base: newBaseHP,
                    max: newMaxHP,
                    value: newValueHP,
                }
            };
        }, { actorId, hpRoll, items });

        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({ success: true, actor: result });

    } catch (error: any) {
        console.error('[API] Finalize Level-Up Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to finalize level-up' }, { status: 500 });
    }
}
