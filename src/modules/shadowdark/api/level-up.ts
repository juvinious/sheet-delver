
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/foundry/instance';

/**
 * GET /api/shadowdark/actors/[id]/level-up/data
 * Fetch level-up data for the modal
 */
export async function handleGetLevelUpData(actorId: string) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const data = await client.page!.evaluate(async ({ actorId }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return { error: 'Actor not found' };

            const currentLevel = actor.system?.level?.value || 0;
            const targetLevel = currentLevel + 1;
            const currentXP = actor.system?.level?.xp || 0;

            // Get class document
            const classUuid = actor.system?.class;
            // @ts-ignore
            const classDoc = classUuid ? await fromUuid(classUuid) : null;

            // Determine if talent is gained (odd levels)
            const talentGained = targetLevel % 2 !== 0;

            // Get patron if applicable
            const patronUuid = actor.system?.patron;
            // @ts-ignore
            const patronDoc = patronUuid ? await fromUuid(patronUuid) : null;

            // Check if spellcaster
            const isSpellcaster = Boolean(
                classDoc?.system?.spellcasting?.class ||
                classDoc?.system?.spellcasting?.ability
            );

            // Calculate spell slots to fill
            const spellsToChoose: Record<number, number> = {};
            let availableSpells: any[] = [];

            if (isSpellcaster) {
                // Calculate slots
                if (classDoc?.system?.spellcasting?.spellsknown) {
                    const skTable = classDoc.system.spellcasting.spellsknown;
                    const currentSpells = skTable[currentLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                    const targetSpells = skTable[targetLevel] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

                    for (let tier = 1; tier <= 5; tier++) {
                        const diff = (targetSpells[tier] || 0) - (currentSpells[tier] || 0);
                        if (diff > 0) {
                            spellsToChoose[tier] = diff;
                        }
                    }
                }

                // Fetch available spells using official system method
                // @ts-ignore
                if (window.shadowdark?.compendiums?.classSpellBook) {
                    // @ts-ignore
                    const spells = await window.shadowdark.compendiums.classSpellBook(classUuid);
                    // Handle cases where spells might be plain objects or Documents
                    availableSpells = spells.map((s: any) => {
                        if (typeof s.toJSON === 'function') return s.toJSON();
                        return s;
                    });
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
                conMod: actor.system?.abilities?.con?.mod || 0,
            };
        }, { actorId });

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
export async function handleRollHP(actorId: string, request: Request) {
    try {
        const client = getClient();
        if (!client || !client.isConnected) {
            return NextResponse.json({ error: 'Not connected to Foundry' }, { status: 503 });
        }

        const { isReroll } = await request.json();

        const result = await client.page!.evaluate(async ({ actorId }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return { error: 'Actor not found' };

            // Get class hit die
            const classUuid = actor.system?.class;
            // @ts-ignore
            const classDoc = classUuid ? await fromUuid(classUuid) : null;
            const hitDie = classDoc?.system?.hitPoints || '1d4';

            // Roll HP using Foundry's Roll class
            // @ts-ignore
            const roll = new Roll(hitDie);
            await roll.evaluate();

            // Create a chat message for the roll
            // @ts-ignore
            await roll.toMessage({
                // @ts-ignore
                speaker: window.game.actors.get(actorId) ? window.ChatMessage.getSpeaker({ actor: window.game.actors.get(actorId) }) : undefined,
                flavor: `Hit Point Roll (Level Up)`
            });

            return {
                success: true,
                formula: hitDie,
                total: roll.total,
            };
        }, { actorId });

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

            // Add items first (they may include HP/CON bonuses)
            if (items && items.length > 0) {
                await actor.createEmbeddedDocuments('Item', items);
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

            // Update actor
            await actor.update({
                'system.attributes.hp.base': newBaseHP,
                'system.attributes.hp.max': newMaxHP,
                'system.attributes.hp.value': newValueHP,
                'system.auditLog': auditLog,
                'system.level.value': targetLevel,
                'system.level.xp': newXP,
            });

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
