import { GenericSystemAdapter } from '../generic/adapter';
import { ChatCards } from './ui/components/chat/ChatCards';

interface ClassItem {
    name: string;
    description: string;
}

export class MorkBorgAdapter extends GenericSystemAdapter {
    systemId = 'morkborg';

    getClass(actor: any): ClassItem {
        //return actor.items?.find((i: any) => i.type === 'class')?.name || 'Unknown';
        const classItem = actor.items?.find((i: any) => i.type === 'class');
        return {
            name: classItem?.name || 'Unknown',
            description: classItem?.system?.description || ''
        };
    }

    match(actor: any): boolean {
        const hasMorkborgType = ['player', 'character', 'npc'].includes(actor.type?.toLowerCase());
        return actor.systemId === 'morkborg' || hasMorkborgType;
    }

    normalizeActorData(actor: any, client?: any): any {
        const data = super.normalizeActorData(actor);

        if (client && data.items) {
            data.items = data.items.map((item: any) => {
                if (item.img) {
                    item.img = client.resolveUrl(item.img);
                }
                return item;
            });
        }

        return data;
    }



    /**
     * Compute derived actor data (HP, omens, powers, abilities, encumbrance)
     */
    computeActorData(actor: any): any {
        const system = actor.system || {};
        const abilities = system.abilities || {};
        const classData = this.getClass(actor);
        const slotsUsed = this.calculateSlotsUsed(actor);
        const maxSlots = this.calculateMaxSlots(actor);

        return {
            hp: {
                value: system.hp?.value ?? 0,
                max: system.hp?.max ?? 1
            },
            class: classData,
            currentHp: system.hp?.value ?? 0,
            maxHp: system.hp?.max ?? 1,
            omens: {
                value: system.omens?.value ?? 0,
                max: system.omens?.max ?? 0
            },
            powers: {
                value: system.powerUses?.value ?? 0,
                max: system.powerUses?.max ?? 0
            },
            abilities: {
                strength: { value: abilities.strength?.value ?? 0 },
                agility: { value: abilities.agility?.value ?? 0 },
                presence: { value: abilities.presence?.value ?? 0 },
                toughness: { value: abilities.toughness?.value ?? 0 }
            },
            slotsUsed: slotsUsed,
            maxSlots: maxSlots,
            encumbered: slotsUsed > maxSlots,
            encumbranceHelpText: 'STR+8 carried items or DR+2 on AGI/STR tests.',
            criticalHelpText: 'Crit: Gain free attack. Fumble: Take x2 damage, armor reduced one tier.',
            silver: system.silver ?? 0
        };
    }

    /**
     * Categorize items by type
     */
    categorizeItems(actor: any): any {
        const items = (actor.items || []).map((i: any) => this.normalizeItem(i));
        return {
            weapons: items.filter((i: any) => i.type === 'weapon'),
            armor: items.filter((i: any) => i.type === 'armor'),
            equipment: items.filter((i: any) => ['misc', 'container', 'ammo'].includes(i.type)),
            scrolls: items.filter((i: any) => ['scroll', 'tablet'].includes(i.type)),
            feats: items.filter((i: any) => i.type === 'feat'),
            abilities: items.filter((i: any) => !['class', 'weapon', 'armor', 'shield', 'misc', 'container', 'scroll', 'tablet', 'ammo', 'feat'].includes(i.type))
        };
    }

    /**
     * Calculate slots used based on item weights
     */
    private calculateSlotsUsed(actor: any): number {
        const items = actor.items || [];

        // Identify carried containers
        const carriedContainers = items
            .filter((i: any) => i.type === 'container' && (i.system?.equipped || i.system?.carried))
            .map((i: any) => i._id || i.id);

        let totalWeight = 0;

        for (const item of items) {
            const system = item.system || {};
            const type = item.type?.toLowerCase();

            // Only certain items count towards weight
            const weightCountingTypes = ['ammo', 'armor', 'container', 'misc', 'scroll', 'shield', 'weapon', 'tablet'];
            if (!weightCountingTypes.includes(type)) continue;

            // Skip if item is inside a carried container
            if (system.containerId && carriedContainers.includes(system.containerId)) continue;

            // Weight logic: summing Math.ceil(weight * quantity)
            const weight = Number(system.weight) || Number(system.carryWeight) || 0;
            const quantity = Number(system.quantity) || 1;
            totalWeight += Math.ceil(weight * quantity);
        }

        return totalWeight;
    }

    /**
     * Calculate maximum slots (base 8 + strength modifier)
     */
    private calculateMaxSlots(actor: any): number {
        const strengthMod = actor.system?.abilities?.strength?.value ?? 0;
        return 8 + strengthMod;
    }

    /**
     * Normalize item data for UI display
     */
    normalizeItem(item: any): any {
        const system = item.system || {};
        const type = item.type?.toLowerCase();

        return {
            id: item._id || item.id,
            name: item.name,
            type: type,
            img: item.img,
            system: system, // Keep system for sub-components
            description: system.description || '',
            weight: system.weight || 0,
            quantity: system.quantity || 1,
            // Roll specific data
            damageDie: system.damageDie || '',
            damageReductionDie: system.damageReductionDie || '',
            fumbleOn: system.fumbleOn || 1,
            critOn: system.critOn || 20,
            weaponType: system.weaponType || 'melee',
            equipped: system.equipped || false,
            tier: system.tier || { value: 0, max: 0 },
            rollLabel: system.rollLabel || ''
        };
    }

    /**
     * Get roll data or pre-evaluated card content
     */
    getRollData(actor: any, type: string, key: string, options: any = {}): any {
        const system = actor.system || {};
        const abilities = system.abilities || {};

        if (type === 'dice') {
            return {
                formula: key,
                type: 'dice',
                label: options.flavor || 'Roll'
            };
        }

        if (type === 'ability') {
            return {
                type: 'ability',
                statKey: key,
                isAutomated: true,
                options: options,
                label: `Test ${key.charAt(0).toUpperCase() + key.slice(1)}`
            };
        }

        if (type === 'item') {
            const item = (actor.items || []).find((i: any) => i.uuid === key || i._id === key || i.id === key);
            const itemData = this.normalizeItem(item || {});

            if (options.rollType === 'attack' || options.rollType === 'defend') {
                // Return metadata so the server knows it needs to perform an automated sequence
                return {
                    type: options.rollType,
                    itemId: itemData.id,
                    isAutomated: true,
                    options: options,
                    label: options.rollType === 'attack' ? `Attack: ${itemData.name}` : `Defense: ${itemData.name}`
                };
            }

            if (itemData.type === 'scroll' || itemData.type === 'power' || itemData.type === 'feat') {
                return {
                    type: 'power',
                    itemId: itemData.id,
                    isAutomated: true,
                    label: `Power: ${itemData.name}`
                };
            }
        }

        if (type === 'initiative') {
            return {
                type: 'initiative',
                subType: key, // 'individual' or 'party'
                isAutomated: true,
                options: options,
                label: key === 'party' ? 'Party Initiative' : 'Initiative'
            };
        }

        if (type === 'rest') {
            return {
                type: 'rest',
                isAutomated: true,
                label: 'Rest'
            };
        }

        if (type === 'broken') {
            return {
                type: 'broken',
                isAutomated: true,
                label: 'Broken'
            };
        }

        if (type === 'getBetter') {
            return {
                type: 'getBetter',
                isAutomated: true,
                label: 'Get Better'
            };
        }

        if (type === 'spendOmen') {
            return {
                type: 'spendOmen',
                isAutomated: true,
                label: 'Spend Omen'
            };
        }

        return {
            formula: '1d20',
            type: 'default',
            label: 'Roll'
        };
    }

    /**
     * Generate stylized HTML for an automated roll card
     */
    generateRollCard(actorData: any, results: any): string {
        const { type, subType, item, rolls, outcomes, options } = results;

        if (type === 'attack') {
            return ChatCards.attack({
                weaponTypeLabel: item?.system?.weaponType === 'ranged' ? 'Ranged' : 'Melee',
                items: item ? [item] : [],
                attackFormula: rolls.find((r: any) => r.isAttack)?.formula || '',
                attackDR: options.modifiedDR || 12,
                attackRoll: rolls.find((r: any) => r.isAttack)?.json,
                attackOutcome: outcomes[0],
                damageRoll: rolls.find((r: any) => r.isDamage)?.json,
                targetArmorRoll: rolls.find((r: any) => r.isTargetArmor)?.json,
                takeDamage: outcomes.find((o: string) => o.includes('INFLICT'))
            });
        }

        if (type === 'defend') {
            return ChatCards.defend({
                items: item ? [item] : [],
                defendFormula: rolls.find((r: any) => r.isDefend)?.formula || '',
                defendDR: options.modifiedDR || 12,
                defendRoll: rolls.find((r: any) => r.isDefend)?.json,
                defendOutcome: outcomes[0],
                attackRoll: rolls.find((r: any) => r.isAttack)?.json,
                armorRoll: rolls.find((r: any) => r.isArmor)?.json,
                takeDamage: outcomes.find((o: string) => o.includes('SUFFER'))
            });
        }

        if (type === 'ability') {
            const statName = subType?.charAt(0).toUpperCase() + subType?.slice(1) || '';
            const roll = rolls[0];
            return ChatCards.result({
                cardTitle: `Test ${statName}`,
                items: item ? [item] : [],
                drModifiers: results.drModifiers,
                rollResults: [{
                    rollTitle: roll?.formula || '',
                    roll: roll?.json,
                    outcomeLines: outcomes
                }]
            });
        }

        if (type === 'getBetter') {
            return ChatCards.getBetter(results.getBetterData);
        }

        if (type === 'spendOmen') {
            return ChatCards.result({
                cardTitle: 'Spend Omen',
                rollResults: [{
                    rollTitle: 'Choose one effect:',
                    outcomeLines: outcomes
                }]
            });
        }

        // Default / Initiative / Results
        const cardTitle = type === 'initiative' ? (subType === 'party' ? 'Party Initiative' : 'Initiative') : 'Test';
        return ChatCards.result({
            cardTitle,
            items: item ? [item] : [],
            rollResults: rolls.map((r: any) => ({
                rollTitle: r.label,
                roll: r.json,
                outcomeLines: outcomes
            }))
        });
    }

    /**
     * Perform an automated roll sequence (Attack, Defense, Initiative)
     */
    async performAutomatedSequence(client: any, actor: any, rollData: any, options: any): Promise<any> {
        const results: any = {
            type: rollData.type,
            item: actor.items?.find((i: any) => i._id === rollData.itemId || i.id === rollData.itemId),
            rolls: [],
            outcomes: [],
            options
        };

        const collectedRolls: string[] = [];

        const parseSyntheticRoll = (rollResult: any, label: string, tags: any = {}) => {
            if (!rollResult) return { total: 0, formula: '', dice: [] };

            const rollJsonStr = rollResult.rolls ? rollResult.rolls[0] : null;
            if (rollJsonStr) {
                collectedRolls.push(rollJsonStr);
            }

            if (typeof rollResult.total === 'number' && !rollResult._synthetic) return rollResult;

            try {
                const rollData = rollJsonStr ? JSON.parse(rollJsonStr) : null;
                const parsed = {
                    label,
                    total: rollData?.total ?? 0,
                    formula: rollData?.formula ?? '',
                    json: rollData,
                    ...tags,
                    dice: rollData?.terms ? [{
                        results: rollData.terms
                            .filter((t: any) => (t.faces === 20 || t.faces === 6) && t.results)
                            .flatMap((t: any) => t.results)
                    }] : []
                };
                results.rolls.push(parsed);
                return parsed;
            } catch (e) {
                return { total: 0, formula: '', dice: [] };
            }
        };

        const speaker = options?.speaker || {
            actor: actor._id || actor.id,
            alias: actor.name
        };

        if (rollData.type === 'attack') {
            const isRanged = results.item?.system?.weaponType === 'ranged';
            const mod = isRanged ? (actor.system?.abilities?.presence?.value ?? 0) : (actor.system?.abilities?.strength?.value ?? 0);
            const modifiedDR = options.modifiedDR || 12;
            const hitResult = await client.roll(`1d20${mod >= 0 ? '+' : ''}${mod}`, `Attack Vs DR ${modifiedDR}`, { displayChat: false });
            const hitRoll = parseSyntheticRoll(hitResult, 'Attack', { isAttack: true });

            const d20 = hitRoll.json?.terms?.find((t: any) => t.class === 'Die' && t.faces === 20)?.results?.[0]?.result;
            const fumbleTarget = results.item?.system?.fumbleOn ?? 1;
            const critTarget = results.item?.system?.critOn ?? 20;
            const isFumble = d20 <= fumbleTarget;
            const isCrit = d20 >= critTarget;
            const isHit = hitRoll.total !== 1 && (hitRoll.total === 20 || hitRoll.total >= modifiedDR);

            if (isHit) {
                results.outcomes.push(isCrit ? 'CRITICAL SUCCESS!' : 'HIT!');
                const damageFormula = isCrit ? `(${results.item?.system?.damageDie || '1d4'}) * 2` : (results.item?.system?.damageDie || '1d4');
                const damageResult = await client.roll(damageFormula, 'Damage', { displayChat: false });
                const damageRoll = parseSyntheticRoll(damageResult, 'Damage', { isDamage: true });

                let totalDamage = damageRoll.total;
                const armorFormula = options.targetArmor?.trim();
                if (armorFormula && armorFormula !== '0') {
                    const armorResult = await client.roll(armorFormula, 'Target Armor', { displayChat: false });
                    const armorRoll = parseSyntheticRoll(armorResult, 'Target Armor', { isTargetArmor: true });
                    totalDamage = Math.max(totalDamage - armorRoll.total, 0);
                }
                results.outcomes.push(`INFLICT ${totalDamage} DAMAGE`);
            } else {
                results.outcomes.push(isFumble ? 'FUMBLE!' : 'MISS!');
            }
        } else if (rollData.type === 'defend') {
            const mod = actor.system?.abilities?.agility?.value ?? 0;
            const modifiedDR = options.modifiedDR || 12;
            const defendResult = await client.roll(`1d20${mod >= 0 ? '+' : ''}${mod}`, `Defense Vs DR ${modifiedDR}`, { displayChat: false });
            const defendRoll = parseSyntheticRoll(defendResult, 'Defense', { isDefend: true });

            const isPassed = defendRoll.total !== 1 && (defendRoll.total === 20 || defendRoll.total >= modifiedDR);

            if (isPassed) {
                results.outcomes.push('SUCCESS!');
            } else {
                results.outcomes.push('FAILED!');
                if (options.incomingAttack) {
                    const attackResult = await client.roll(options.incomingAttack, 'Incoming Attack', { displayChat: false });
                    const attackRoll = parseSyntheticRoll(attackResult, 'Incoming Attack', { isAttack: true });

                    const armorDR = results.item?.system?.damageReductionDie || 'd2';
                    const armorResult = await client.roll(armorDR, 'Armor DR', { displayChat: false });
                    const armorRoll = parseSyntheticRoll(armorResult, 'Armor DR', { isArmor: true });

                    const damageTaken = Math.max(attackRoll.total - armorRoll.total, 0);
                    results.outcomes.push(`SUFFER ${damageTaken} DAMAGE`);
                }
            }
        } else if (rollData.type === 'ability') {
            const key = rollData.statKey;
            const statMod = actor.system?.abilities?.[key]?.value ?? 0;
            const slotsUsed = this.calculateSlotsUsed(actor);
            const maxSlots = this.calculateMaxSlots(actor);
            const isEncumbered = slotsUsed > maxSlots;

            // In Mork Borg, encumbrance adds +2 to the DR of Agility and Strength tests.
            // But usually the "flavor" of being encumbered is shown on the card.
            if (isEncumbered && (key === 'strength' || key === 'agility')) {
                results.drModifiers = ['Encumbered: DR +2'];
            }

            const formula = `1d20${statMod >= 0 ? '+' : ''}${statMod}`;
            const label = `1d20 + ${key.toUpperCase().slice(0, 3)}`;
            const rollResult = await client.roll(formula, label, { displayChat: false });
            parseSyntheticRoll(rollResult, label, { formula: `1d20 + ${key.toUpperCase().slice(0, 3)}` });
            results.subType = key;
        } else if (rollData.type === 'initiative') {
            if (rollData.subType === 'party') {
                const partyResult = await client.roll('1d6', 'Party Initiative', { displayChat: false });
                const partyRoll = parseSyntheticRoll(partyResult, 'Roll');
                results.subType = 'party';
                if (partyRoll.total <= 3) {
                    results.outcomes.push('NPCS GO FIRST');
                } else {
                    results.outcomes.push('PCS GO FIRST');
                }
            } else {
                const mod = actor.system?.abilities?.agility?.value ?? 0;
                const initResult = await client.roll(`1d20${mod >= 0 ? '+' : ''}${mod}`, 'Initiative', { displayChat: false });
                const initRoll = parseSyntheticRoll(initResult, 'Roll');
                results.subType = 'individual';
            }
        } else if (rollData.type === 'rest') {
            const currentHp = actor.system?.hp?.value ?? 0;
            const maxHp = actor.system?.hp?.max ?? 1;
            let newHp = currentHp;
            let newPowerMax = actor.system?.powerUses?.max ?? 0;
            let newOmenData = null;
            let skipRecovery = false;

            // 1. Infection (Prioritized)
            if (options?.infected) {
                const damageRes = await client.roll('1d6', 'Infection Damage', { displayChat: false });
                const damageRoll = parseSyntheticRoll(damageRes, 'Damage');
                newHp = Math.max(0, currentHp - damageRoll.total);
                results.outcomes.push(`INFECTED! SUFFER ${damageRoll.total} DAMAGE.`);
                skipRecovery = true;
            }

            // 2. Starvation (Only if not already skipped by infection)
            if (!skipRecovery && options?.foodAndDrink === 'starve') {
                const damageRes = await client.roll('1d4', 'Starvation Damage', { displayChat: false });
                const damageRoll = parseSyntheticRoll(damageRes, 'Damage');
                newHp = Math.max(0, currentHp - damageRoll.total);
                results.outcomes.push(`STARVING! SUFFER ${damageRoll.total} DAMAGE.`);
                skipRecovery = true;
            }

            // 3. Skip Eating
            if (!skipRecovery && options?.foodAndDrink === 'donteat') {
                results.outcomes.push('SKIPPED EATING. NO RECOVERY.');
                skipRecovery = true;
            }

            // 4. Recovery
            if (!skipRecovery) {
                const restLength = options?.restLength || 'short';
                const formula = restLength === 'long' ? '1d6' : '1d4';
                const healResult = await client.roll(formula, `Rest (${restLength})`, { displayChat: false });
                const healRoll = parseSyntheticRoll(healResult, 'Heal');
                newHp = Math.min(maxHp, currentHp + healRoll.total);
                results.outcomes.push(`RECOVERED ${healRoll.total} HP.`);

                if (restLength === 'long') {
                    // Reset Powers
                    const preMod = actor.system?.abilities?.presence?.value ?? 0;
                    const powerFormula = `1d4${preMod >= 0 ? '+' : ''}${preMod}`;
                    const powerRes = await client.roll(powerFormula, 'Powers Reset', { displayChat: false });
                    const powerRoll = parseSyntheticRoll(powerRes, 'Powers');
                    newPowerMax = Math.max(0, powerRoll.total);
                    results.outcomes.push(`POWERS RESET TO ${newPowerMax}.`);

                    // Reset Omens (if 0)
                    if ((actor.system?.omens?.value ?? 0) === 0) {
                        const classItem = actor.items?.find((i: any) => i.type === 'class');
                        const omenDie = classItem?.system?.omenDie || '1d2';
                        const omenRes = await client.roll(omenDie, 'Omens Reset', { displayChat: false });
                        const omenRoll = parseSyntheticRoll(omenRes, 'Omens');
                        const newOmenMax = Math.max(0, omenRoll.total);
                        newOmenData = { value: newOmenMax, max: newOmenMax };
                        results.outcomes.push(`OMENS RESET TO ${newOmenMax}.`);
                    }
                }
            }

            // Update actor
            const updates: any = {
                _id: actor._id || actor.id,
                'system.hp.value': newHp,
                'system.powerUses.value': newPowerMax,
                'system.powerUses.max': newPowerMax
            };
            if (newOmenData) {
                updates['system.omens'] = newOmenData;
            }

            await client.dispatchDocumentSocket('Actor', 'update', {
                ids: [actor._id || actor.id],
                updates: [updates]
            });
        } else if (rollData.type === 'broken') {
            const tableResult = await client.roll('1d4', 'Broken', { displayChat: false });
            const tableRoll = parseSyntheticRoll(tableResult, 'Roll');
            const table = [
                'Unconscious for 1d6+4 rounds. Wake with 1d4 HP.',
                'Roll d6: 1-5 Broken limb, 6 Severed.',
                'Hemorrhage. Death in d2 rounds.',
                'DEAD.'
            ];
            results.outcomes.push(table[tableRoll.total - 1] || 'Unknown Outcome');
        } else if (rollData.type === 'getBetter') {
            // 1. HP Check
            const hpCheckResult = await client.roll('6d10', 'Get Better: HP Check', { displayChat: false });
            const hpCheckRoll = parseSyntheticRoll(hpCheckResult, '6d10 vs HP');
            const currentMax = actor.system?.hp?.max ?? 1;
            let hpOutcome = `Roll ${hpCheckRoll.total} vs Max HP ${currentMax}: Failed.`;
            let newMax = currentMax;

            if (hpCheckRoll.total > currentMax) {
                const increaseResult = await client.roll('1d6', 'HP Increase', { displayChat: false });
                const increaseRoll = parseSyntheticRoll(increaseResult, 'Increase');
                newMax = currentMax + increaseRoll.total;
                hpOutcome = `Roll ${hpCheckRoll.total} vs Max HP ${currentMax}: Success! Max HP increased by ${increaseRoll.total} to ${newMax}.`;
            }

            // 2. Ability Checks
            const abilities = ['strength', 'agility', 'presence', 'toughness'];
            const abilityOutcomes: any = {};
            const abilityUpdates: any = {};

            for (const ab of abilities) {
                const abRes = await client.roll('1d10', `Get Better: ${ab}`, { displayChat: false });
                const abRoll = parseSyntheticRoll(abRes, ab);
                const currentVal = actor.system?.abilities?.[ab]?.value ?? 0;

                if (abRoll.total > currentVal && currentVal < 6) {
                    abilityUpdates[`system.abilities.${ab}.value`] = currentVal + 1;
                    abilityOutcomes[ab] = `${ab.charAt(0).toUpperCase() + ab.slice(1)}: Increased to ${currentVal + 1}`;
                } else if (abRoll.total <= currentVal && currentVal > -3) {
                    abilityUpdates[`system.abilities.${ab}.value`] = currentVal - 1;
                    abilityOutcomes[ab] = `${ab.charAt(0).toUpperCase() + ab.slice(1)}: Decreased to ${currentVal - 1}`;
                } else {
                    abilityOutcomes[ab] = `${ab.charAt(0).toUpperCase() + ab.slice(1)}: No change (${currentVal})`;
                }
            }

            // 3. Debris (Standard MB flavor)
            const debrisResult = await client.roll('d100', 'Debris Search', { displayChat: false });
            const debrisRoll = parseSyntheticRoll(debrisResult, 'Debris');
            const debrisOutcome = `Found something useful (Roll ${debrisRoll.total}).`;

            results.getBetterData = {
                hpOutcome,
                strOutcome: abilityOutcomes.strength,
                agiOutcome: abilityOutcomes.agility,
                preOutcome: abilityOutcomes.presence,
                touOutcome: abilityOutcomes.toughness,
                debrisOutcome
            };

            // Update actor
            const updates = {
                _id: actor._id || actor.id,
                'system.hp.max': newMax,
                ...abilityUpdates
            };
            await client.dispatchDocumentSocket('Actor', 'update', {
                ids: [actor._id || actor.id],
                updates: [updates]
            });
        } else if (rollData.type === 'spendOmen') {
            results.outcomes = [
                '• Deal maximum damage with one attack.',
                '• Reroll a die (yours or someone else\'s).',
                '• Lower a DR by 4.',
                '• DR 6 instead of 12 for a test.',
                '• Neutralize a Crit or Fumble.',
                '• Lower damage taken by d6.'
            ];
        } else if (rollData.type === 'power') {
            const currentUses = actor.system?.powerUses?.value ?? 0;
            if (currentUses < 1) {
                results.outcomes.push('NO POWER USES REMAINING!');
                results.outcomes.push('Failed to wield power.');
            } else {
                const preMod = actor.system?.abilities?.presence?.value ?? 0;
                const powerRes = await client.roll(`1d20${preMod >= 0 ? '+' : ''}${preMod}`, 'Power: Presence DR 12', { displayChat: false });
                const powerRoll = parseSyntheticRoll(powerRes, 'Presence');

                const newUses = currentUses - 1;
                const updates: any = {
                    _id: actor._id || actor.id,
                    'system.powerUses.value': newUses
                };

                if (powerRoll.total === 1) {
                    results.outcomes.push('FUMBLE! Arcane Catastrophe!');
                    const damageRes = await client.roll('1d2', 'Catastrophe Damage', { displayChat: false });
                    const damageRoll = parseSyntheticRoll(damageRes, 'Damage');
                    results.outcomes.push(`SUFFER ${damageRoll.total} DAMAGE and power blocked for 1 hour.`);
                    // Update HP
                    const currentHp = actor.system?.hp?.value ?? 0;
                    updates['system.hp.value'] = Math.max(0, currentHp - damageRoll.total);
                } else if (powerRoll.total >= 12) {
                    results.outcomes.push('SUCCESS!');
                } else {
                    results.outcomes.push('FAILED!');
                    const damageRes = await client.roll('1d2', 'Failure Damage', { displayChat: false });
                    const damageRoll = parseSyntheticRoll(damageRes, 'Damage');
                    results.outcomes.push(`SUFFER ${damageRoll.total} DAMAGE and power blocked for 1 hour.`);
                    // Update HP
                    const currentHp = actor.system?.hp?.value ?? 0;
                    updates['system.hp.value'] = Math.max(0, currentHp - damageRoll.total);
                }

                await client.dispatchDocumentSocket('Actor', 'update', {
                    ids: [actor._id || actor.id],
                    updates: [updates]
                });
            }
        }

        const html = this.generateRollCard(actor, results);
        return await client.sendMessage({
            content: html,
            rolls: collectedRolls,
            type: 5 // Explicitly set as ROLL type
        }, { rollMode: options?.rollMode, speaker });
    }

    /**
     * Get adapter configuration (server-side, no browser access needed)
     */
    getConfig() {
        return {
            actorCard: {
                // Subtext paths to display on actor cards
                // Format: ["path.to.field", "another.path"]
                subtext: ['derived.class.name']
            }
        };
    }
}

