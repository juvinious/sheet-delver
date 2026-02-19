import { GenericSystemAdapter } from '../generic/adapter';

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
            const stat = abilities[key]?.value ?? 0;
            const sign = stat >= 0 ? '+' : '';
            return {
                formula: `1d20${sign}${stat}`,
                type: 'ability',
                label: `${key.toUpperCase()} Test`
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
                const mod = abilities.presence?.value ?? 0;
                const sign = mod >= 0 ? '+' : '';
                return {
                    formula: `1d20${sign}${mod}`,
                    type: 'power',
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
        const { type, item, rolls, outcomes } = results;
        const icon = item?.img ? `<img src="${item.img}" title="${item.name}" width="24" height="24" class="chat-card-image" />` : '';

        // Mork Borg aesthetic classes matching the module's template structure
        let html = `<form class="roll-card ${type}-roll-card">`;

        // Header
        let title = type === 'attack' ? 'Melee Attack' : (type === 'defend' ? 'Defense' : 'Test');
        if (type === 'initiative') {
            title = results.subType === 'party' ? 'Party Initiative' : 'Initiative';
        }
        html += `<div class="card-title">${title}</div>`;

        // Item Row
        if (item) {
            html += `
  <div class="item-row">
    ${icon}
    <span class="item-name">${item.name}</span>
  </div>`;
        }

        // Rolls
        for (const r of rolls) {
            html += `
                <div class="roll-result">
                    <div class="roll-title">
                        <span>${r.label}: ${r.formula}</span>
                    </div>
                    <div class="roll-row">
                        <span>${r.total}</span>
                    </div>
                </div>
            `;
        }

        // Outcomes (Big yellow blocks)
        for (const o of outcomes) {
            if (!o) continue;
            html += `
                <div class="outcome-row">
                    <span>${o}</span>
                </div>
            `;
        }

        html += `</form>`;
        return html;
    }

    /**
     * Perform an automated roll sequence (Attack, Defense, Initiative)
     */
    async performAutomatedSequence(client: any, actor: any, rollData: any, options: any): Promise<any> {
        const results: any = {
            type: rollData.type,
            item: actor.items?.find((i: any) => i._id === rollData.itemId || i.id === rollData.itemId),
            rolls: [],
            outcomes: []
        };

        const parseSyntheticRoll = (rollResult: any) => {
            if (!rollResult) return { total: 0, formula: '', dice: [] };
            if (typeof rollResult.total === 'number') return rollResult;
            try {
                const rollData = rollResult.rolls ? JSON.parse(rollResult.rolls[0]) : null;
                return {
                    total: rollData?.total ?? 0,
                    formula: rollData?.formula ?? '',
                    dice: rollData?.terms ? [{
                        results: rollData.terms
                            .filter((t: any) => t.faces === 20 && t.results)
                            .flatMap((t: any) => t.results)
                    }] : []
                };
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
            const hitRoll = parseSyntheticRoll(hitResult);
            results.rolls.push({ label: 'Attack', formula: `${hitRoll.formula} Vs DR ${modifiedDR}`, total: hitRoll.total });

            const d20 = hitRoll.dice?.[0]?.results?.[0]?.result;
            const fumbleTarget = results.item?.system?.fumbleOn ?? 1;
            const critTarget = results.item?.system?.critOn ?? 20;
            const isFumble = d20 <= fumbleTarget;
            const isCrit = d20 >= critTarget;
            const isHit = hitRoll.total !== 1 && (hitRoll.total === 20 || hitRoll.total >= modifiedDR);

            if (isHit) {
                results.outcomes.push(isCrit ? 'CRITICAL SUCCESS!' : 'HIT!');
                const damageFormula = isCrit ? `(${results.item?.system?.damageDie || '1d4'}) * 2` : (results.item?.system?.damageDie || '1d4');
                const damageResult = await client.roll(damageFormula, 'Damage', { displayChat: false });
                const damageRoll = parseSyntheticRoll(damageResult);
                results.rolls.push({ label: 'Damage', formula: damageRoll.formula, total: damageRoll.total });

                let totalDamage = damageRoll.total;
                const armorFormula = options.targetArmor?.trim();
                if (armorFormula && armorFormula !== '0') {
                    const armorResult = await client.roll(armorFormula, 'Target Armor', { displayChat: false });
                    const armorRoll = parseSyntheticRoll(armorResult);
                    results.rolls.push({ label: 'Target Armor', formula: armorRoll.formula, total: armorRoll.total });
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
            const defendRoll = parseSyntheticRoll(defendResult);
            results.rolls.push({ label: 'Defense', formula: `${defendRoll.formula} Vs DR ${modifiedDR}`, total: defendRoll.total });

            const isPassed = defendRoll.total !== 1 && (defendRoll.total === 20 || defendRoll.total >= modifiedDR);

            if (isPassed) {
                results.outcomes.push('SUCCESS!');
            } else {
                results.outcomes.push('FAILED!');
                if (options.incomingAttack) {
                    const attackResult = await client.roll(options.incomingAttack, 'Incoming Attack', { displayChat: false });
                    const attackRoll = parseSyntheticRoll(attackResult);
                    results.rolls.push({ label: 'Incoming Attack', formula: attackRoll.formula, total: attackRoll.total });

                    const armorDR = results.item?.system?.damageReductionDie || 'd2';
                    const armorResult = await client.roll(armorDR, 'Armor DR', { displayChat: false });
                    const armorRoll = parseSyntheticRoll(armorResult);
                    results.rolls.push({ label: 'Armor DR', formula: armorRoll.formula, total: armorRoll.total });

                    const damageTaken = Math.max(attackRoll.total - armorRoll.total, 0);
                    results.outcomes.push(`SUFFER ${damageTaken} DAMAGE`);
                }
            }
        } else if (rollData.type === 'initiative') {
            if (rollData.subType === 'party') {
                const partyResult = await client.roll('1d6', 'Party Initiative', { displayChat: false });
                const partyRoll = parseSyntheticRoll(partyResult);
                results.rolls.push({ label: 'Roll', formula: partyRoll.formula, total: partyRoll.total });
                results.subType = 'party';
                if (partyRoll.total <= 3) {
                    results.outcomes.push('NPCS GO FIRST');
                } else {
                    results.outcomes.push('PCS GO FIRST');
                }
            } else {
                const mod = actor.system?.abilities?.agility?.value ?? 0;
                const initResult = await client.roll(`1d20${mod >= 0 ? '+' : ''}${mod}`, 'Initiative', { displayChat: false });
                const initRoll = parseSyntheticRoll(initResult);
                results.rolls.push({ label: 'Roll', formula: initRoll.formula, total: initRoll.total });
                results.subType = 'individual';
                if (initRoll.total >= 12) {
                    results.outcomes.push('INITIATIVE PASSED');
                } else {
                    results.outcomes.push('INITIATIVE FAILED');
                }
            }
        }

        const html = this.generateRollCard(actor, results);
        return await client.sendMessage(html, { rollMode: options?.rollMode, speaker });
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
