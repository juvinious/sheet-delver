import { SystemAdapter, ActorSheetData } from './types';

export class ShadowdarkAdapter implements SystemAdapter {
    systemId = 'shadowdark';

    normalizeActorData(actor: any): ActorSheetData {
        const s = actor.system;
        const classItem = (actor.items || []).find((i: any) => i.type === 'Class');

        // Shadowdark Schema:
        // system.attributes.hp: { value, max, base, bonus }
        // system.attributes.ac: { value }
        // system.abilities: { str: { mod, ... }, ... }

        const hp = s.attributes?.hp || { value: 0, max: 0 };
        const ac = s.attributes?.ac?.value || 10;

        const abilities = s.abilities || {};

        // Resolve helper for items
        const findItemName = (type: string) => {
            // @ts-ignore
            const item = (actor.items || []).find((i: any) => i.type === type);
            return item ? item.name : null;
        };

        // Shadowdark stores class/ancestry sometimes as links in system, but we might prefer the Item name if it exists on the actor
        const className = s.class || s.details?.class || findItemName('class') || '';
        const ancestryName = s.ancestry || s.details?.ancestry || findItemName('ancestry') || '';
        const backgroundName = s.background || s.details?.background || findItemName('background') || '';

        const sheetData: ActorSheetData = {
            id: actor.id,
            name: actor.name,
            type: actor.type,
            img: actor.img,
            hp: { value: hp.value, max: hp.max },
            ac: ac,
            attributes: abilities,
            stats: abilities,
            items: actor.items || [],
            level: {
                value: s.level?.value || 1,
                xp: s.level?.xp || 0,
                // User requirement: Display as "value / 10" (or max)
                next: s.level?.xp_max || 10
            },
            details: {
                alignment: (s.alignment || s.details?.alignment) ? ((s.alignment || s.details?.alignment).charAt(0).toUpperCase() + (s.alignment || s.details?.alignment).slice(1)) : 'Neutral',
                background: backgroundName,
                ancestry: ancestryName,
                class: className,
                deity: s.deity,
                languages: s.languages || [],
                classLanguages: classItem?.system?.languages || [],
                biography: s.details?.biography?.value || s.biography || '',
                notes: s.notes || s.details?.notes?.value || ''
            },
            luck: s.luck,
            coins: s.coins,
            effects: actor.effects || [],
            computed: actor.computed,
            choices: {
                alignments: actor.systemConfig?.ALIGNMENTS ? Object.values(actor.systemConfig.ALIGNMENTS) : ['Lawful', 'Neutral', 'Chaotic'],
                ancestries: [], // Placeholder, populate if cached or passed
                backgrounds: [] // Placeholder
            }
        };

        // Title Resolution

        if (classItem && classItem.system?.titles && Array.isArray(classItem.system.titles)) {
            // Find the highest title level <= current character level
            const currentLevel = sheetData.level?.value || 0;
            const validTitles = classItem.system.titles.filter((t: any) => t.level <= currentLevel);
            // Sort by level descending
            validTitles.sort((a: any, b: any) => b.level - a.level);

            if (validTitles.length > 0) {
                if (sheetData.details) sheetData.details.title = validTitles[0].name;
            }
        }

        return sheetData;
    }

    getRollData(actor: any, type: string, key: string, options: any = {}): { formula: string; type: string; label: string } | null {
        // Options: abilityBonus, itemBonus, talentBonus, rollingMode, advantageMode
        const advMode = options.advantageMode || 'normal';
        let dice = '1d20';
        if (advMode === 'advantage') dice = '2d20kh1';
        if (advMode === 'disadvantage') dice = '2d20kl1';

        if (type === 'ability') {
            // Options already contains the overridden bonus from the dialog if passed
            // But we should verify. The dialog passes 'abilityBonus' which includes the stat mod.
            // If options.abilityBonus is present, use it directly as the total mod.
            // Otherwise, fetch from actor.

            let mod = 0;
            if (options.abilityBonus !== undefined) {
                mod = Number(options.abilityBonus);
            } else {
                const abilities = actor.system.abilities;
                if (abilities && abilities[key]) {
                    mod = abilities[key].mod;
                }
            }

            // Add talent bonus if present
            if (options.talentBonus) mod += Number(options.talentBonus);

            const sign = mod >= 0 ? '+' : '';
            return {
                formula: `${dice} ${sign} ${mod}`,
                type: 'ability',
                label: `${key.toUpperCase().replace('ABILITY', '')} Check`
            };
        }

        if (type === 'item') {
            const item = (actor.items || []).find((i: any) => i._id === key || i.id === key);

            if (item) {
                let totalBonus = 0;
                let label = '';

                if (item.type === 'Spell') {
                    // Spell Casting
                    label = `Cast ${item.name}`;
                    // If options provided, trust them
                    if (options.abilityBonus !== undefined) {
                        totalBonus += Number(options.abilityBonus);
                    } else {
                        // Fallback logic
                        const statKey = item.system?.ability || 'int';
                        totalBonus += actor.system.abilities?.[statKey]?.mod || 0;
                    }
                } else if (item.type === 'Weapon') {
                    // Attack
                    label = `${item.name} Attack`;

                    if (options.abilityBonus !== undefined && options.itemBonus !== undefined) {
                        totalBonus = Number(options.abilityBonus) + Number(options.itemBonus);
                    } else {
                        // Fallback logic
                        const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                        const isRanged = item.system?.type === 'ranged' || item.system?.range === 'near' || item.system?.range === 'far';

                        const str = actor.system.abilities?.str?.mod || 0;
                        const dex = actor.system.abilities?.dex?.mod || 0;
                        const itemBonus = item.system?.bonuses?.attackBonus || 0;

                        let mod = 0;
                        if (isRanged) {
                            mod = dex;
                        } else if (isFinesse) {
                            mod = Math.max(str, dex);
                        } else {
                            mod = str;
                        }
                        totalBonus = mod + itemBonus;
                    }
                }

                // Add Talent Bonus
                if (options.talentBonus) totalBonus += Number(options.talentBonus);

                const sign = totalBonus >= 0 ? '+' : '';
                return {
                    formula: `${dice} ${sign} ${totalBonus}`,
                    type: item.type === 'Spell' ? 'spell' : 'attack',
                    label: label
                };
            }
        }
        return null;
    }
}
