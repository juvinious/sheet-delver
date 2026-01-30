
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
        const actorData = await client.page!.evaluate(async ({ actorId, queryClassUuid }) => {
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
                // Prefer queryClassUuid if provided
                classUuid = queryClassUuid || actor.system?.class;
                patronUuid = actor.system?.patron;
                conMod = actor.system?.abilities?.con?.mod || 0;
            }

            return {
                actorId,
                currentLevel,
                targetLevel,
                currentXP,
                classUuid,
                patronUuid,
                conMod
            };
        }, { actorId, queryClassUuid });

        if ('error' in actorData) {
            return NextResponse.json({ error: actorData.error }, { status: 404 });
        }

        const { currentLevel, targetLevel, currentXP, classUuid, patronUuid, conMod } = actorData;

        // 2. Try to resolve Data locally (Fast Path)
        const classDoc = classUuid ? dataManager.getDocument(classUuid) : null;
        const patronDoc = patronUuid ? dataManager.getDocument(patronUuid) : null;

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
                    availableSpells = dataManager.getSpellsBySource(classDoc.name);
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
                classUuid = queryClassUuid || actor.system?.class;
                patronUuid = actor.system?.patron;
                conMod = actor.system?.abilities?.con?.mod || 0;
            }

            // Get class document
            // @ts-ignore
            const classDoc = classUuid ? await fromUuid(classUuid) : null;

            const talentGained = targetLevel % 2 !== 0;

            // Get patron if applicable
            // @ts-ignore
            const patronDoc = patronUuid ? await fromUuid(patronUuid) : null;

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

                // @ts-ignore
                if (window.shadowdark?.compendiums?.classSpellBook) {
                    // @ts-ignore
                    const spells = await window.shadowdark.compendiums.classSpellBook(classUuid);
                    availableSpells = spells.map((s: any) => {
                        if (typeof s.toJSON === 'function') return s.toJSON();
                        return s;
                    });
                }
            }

            // Get current languages
            // @ts-ignore
            const languages = actor?.system?.languages || [];
            // Resolve language names if possible
            const knownLanguages = [];
            for (const langId of languages) {
                let name = "";
                let uuid = "";

                if (typeof langId === 'object' && langId.name) {
                    name = langId.name;
                } else if (typeof langId === 'string') {
                    // Check if it looks like a UUID
                    if (langId.includes('.') || langId.length > 20) {
                        try {
                            // @ts-ignore
                            const langItem = await fromUuid(langId);
                            if (langItem) {
                                name = langItem.name;
                                uuid = langId;
                            }
                        } catch (e) {
                            // Fallback if UUID resolution fails
                            name = langId;
                        }
                    } else {
                        // Assume it's a name
                        name = langId;
                    }
                }

                if (name) {
                    knownLanguages.push({
                        uuid: uuid,
                        name: name
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
                conMod,
                knownLanguages
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

        const { hpRoll, items, languages } = await request.json();

        const result = await client.page!.evaluate(async ({ actorId, hpRoll, items, languages }) => {
            // @ts-ignore
            const actor = window.game.actors.get(actorId);
            if (!actor) return { error: 'Actor not found' };

            const currentLevel = actor.system?.level?.value || 0;
            const targetLevel = currentLevel + 1;
            const currentXP = actor.system?.level?.xp || 0;

            // Reset XP to 0
            let newXP = 0;

            let createdItems: any[] = [];

            // Add items first (they may include HP/CON bonuses)
            if (items && items.length > 0) {
                console.log('[API] Finalize Items:', items.map((i: any) => `${i.name} (${i.type})`));

                // If we are adding a Class, remove any existing Class items first (e.g. replacing Level 0)
                const newClassItemData = items.find((i: any) => i.type?.toLowerCase() === 'class');
                if (newClassItemData) {
                    console.log('[API] New Class detected, removing existing classes...');
                    const existingClasses = actor.items.filter((i: any) => i.type?.toLowerCase() === 'class');
                    console.log('[API] Existing Classes found:', existingClasses.map((i: any) => i.name));

                    if (existingClasses.length > 0) {
                        const idsToDelete = existingClasses.map((i: any) => i.id);
                        await actor.deleteEmbeddedDocuments('Item', idsToDelete);
                    }
                }

                createdItems = await actor.createEmbeddedDocuments('Item', items);

                // EXPLODING CLASS FEATURES: Recursively add class talents/features if a class was added
                // This accounts for "Spellcasting", "Backstab", etc. which are linked in the Class Item but not in the 'items' payload explicitly.
                const createdClass = createdItems.find((i: any) => i.type?.toLowerCase() === 'class');
                if (createdClass && createdClass.system) {
                    console.log('[API] Expanding Class Features for:', createdClass.name);
                    const featuresToadd = [
                        ...(createdClass.system.talents || []),
                        ...(createdClass.system.features || []),
                        ...(createdClass.system.abilities || [])
                    ];

                    const resolvedFeatures = [];
                    for (const ref of featuresToadd) {
                        // ref can be UUID string or object {uuid, ...}
                        const uuid = (typeof ref === 'string') ? ref : (ref.uuid || ref._id || ref.id);
                        if (uuid) {
                            try {
                                // @ts-ignore
                                const featureDoc = await fromUuid(uuid);
                                if (featureDoc) {
                                    const featureData = featureDoc.toObject();
                                    // @ts-ignore
                                    featureData._id = foundry.utils.randomID();
                                    featureData.system.level = targetLevel; // Assign current level
                                    resolvedFeatures.push(featureData);
                                    console.log('[API] Resolved Class Feature:', featureData.name);
                                }
                            } catch (e) {
                                console.error('[API] Failed to resolve feature:', uuid, e);
                            }
                        }
                    }

                    if (resolvedFeatures.length > 0) {
                        const createdFeatures = await actor.createEmbeddedDocuments('Item', resolvedFeatures);
                        createdItems.push(...createdFeatures);
                    }
                }
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
            // Check both cases as Foundry data structure might vary or be custom
            const auditLog = actor.system?.auditLog || actor.system?.auditlog || {};
            const itemNames = createdItems.map((i: any) => i.name) || [];
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
                // Use the sourceId (Compendium UUID) if available, fallback to the embedded item UUID
                const classUuid = newClass.flags?.core?.sourceId || newClass.uuid || `Actor.${actor.id}.Item.${newClass.id || newClass._id}`;
                console.log('[API] Linking new Class (Compendium):', newClass.name, classUuid);
                updates['system.class'] = classUuid;
            }
            if (newPatron) {
                const patronUuid = newPatron.flags?.core?.sourceId || newPatron.uuid || `Actor.${actor.id}.Item.${newPatron.id || newPatron._id}`;
                console.log('[API] Linking new Patron (Compendium):', newPatron.name, patronUuid);
                updates['system.patron'] = patronUuid;
            }

            // Also link Ancestry and Background if they were added (e.g. 0->1 transition from Generator)
            const newAncestry = createdItems.find((i: any) => i.type?.toLowerCase() === 'ancestry');
            const newBackground = createdItems.find((i: any) => i.type?.toLowerCase() === 'background');

            if (newAncestry) {
                const ancestryUuid = newAncestry.flags?.core?.sourceId || newAncestry.uuid || `Actor.${actor.id}.Item.${newAncestry.id || newAncestry._id}`;
                console.log('[API] Linking new Ancestry (Compendium):', newAncestry.name, ancestryUuid);
                updates['system.ancestry'] = ancestryUuid;
            }
            if (newBackground) {
                const backgroundUuid = newBackground.flags?.core?.sourceId || newBackground.uuid || `Actor.${actor.id}.Item.${newBackground.id || newBackground._id}`;
                console.log('[API] Linking new Background (Compendium):', newBackground.name, backgroundUuid);
                updates['system.background'] = backgroundUuid;
            }

            // Sync Languages (Merge UUIDs/Names)
            if (languages && Array.isArray(languages)) {
                const currentLangs = actor.system?.languages || [];
                // Merge and deduplicate
                const updatedLangs = [...new Set([...currentLangs, ...languages])];
                console.log('[API] Finalizing system.languages with UUIDs:', updatedLangs);
                updates['system.languages'] = updatedLangs;
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
        }, { actorId, hpRoll, items, languages });

        if ('error' in result) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        return NextResponse.json({ success: true, actor: result });

    } catch (error: any) {
        console.error('[API] Finalize Level-Up Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to finalize level-up' }, { status: 500 });
    }
}
