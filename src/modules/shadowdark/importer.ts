import { FoundryClient } from '@/core/foundry';
import fs from 'fs';
import path from 'path';
import { SYSTEM_PREDEFINED_EFFECTS } from './data/talent-effects';

export interface ImportResult {
    success: boolean;
    id?: string;
    actor?: any;
    errors?: string[];
    warnings?: string[];
    debug?: string[];
}

export class ShadowdarkImporter {

    private mapping: any;

    constructor() {
        this.mapping = null;
    }

    private async loadMapping() {
        if (this.mapping) return;
        try {
            const mappingPath = path.join(process.cwd(), 'src/modules/shadowdark/data/shadowdarkling/map-shadowdarkling.json');
            const fileContent = await fs.promises.readFile(mappingPath, 'utf-8');
            this.mapping = JSON.parse(fileContent);
        } catch (error) {
            console.error('[ShadowdarkImporter] Failed to load mapping file', error);
            throw new Error('Failed to load import mappings');
        }
    }

    public async importFromJSON(client: FoundryClient, json: any): Promise<ImportResult> {
        await this.loadMapping();

        // Ensure connected
        // @ts-ignore
        if (!client.isConnected) {
            return { success: false, errors: ['Not connected to Foundry'] };
        }

        const debugLog: string[] = [];
        const log = (msg: string) => debugLog.push(msg);

        log(`[Importer] Starting Import (Server-Side). Name: ${json.name}`);

        const errors: any[] = [];
        const warnings: string[] = [];
        const gear: any[] = [];
        const spells: any[] = [];
        const talents: any[] = [];
        const classAbilities: any[] = [];

        // Pre-fetch all compendium indices for lookup
        log(`[Importer] Fetching compendium indices...`);
        const packs = await client.getAllCompendiumIndices();
        log(`[Importer] Loaded ${packs.length} packs.`);


        // --- HELPER FUNCTIONS ---

        const findItem = async (itemName: string, type: string, silent: boolean = false) => {
            log(`[findItem] Searching for '${itemName}' in '${type}'`);

            // 1. Check mapping
            const mappingCategory = this.mapping?.[type.toLowerCase()];
            let itemUuid = mappingCategory?.[itemName];

            // Case-insensitive fallback for mapping
            if (!itemUuid && mappingCategory) {
                const key = Object.keys(mappingCategory).find(k => k.toLowerCase() === itemName.toLowerCase());
                if (key) {
                    itemUuid = mappingCategory[key];
                    log(`[findItem] Fuzzy mapping match: '${itemName}' -> '${key}'`);
                }
            }

            if (itemUuid) {
                log(`[findItem] Found in mapping: ${itemUuid}`);
                const item = await client.fetchByUuid(itemUuid);
                if (item) return item;
                log(`[findItem] WARN: Mapping UUID ${itemUuid} could not be resolved`);
            }

            // 2. Scan packs (Exact match)
            for (const pack of packs) {
                // Check metadata type if available, otherwise assume checks below handle it
                // Foundry packs usually contain one type, but we can check index items
                const itemIndex = pack.index.find((i: any) =>
                    (i.name.toLowerCase() === itemName.toLowerCase()) &&
                    (i.type.toLowerCase() === type.toLowerCase())
                );

                if (itemIndex) {
                    const uuid = itemIndex.uuid || `Compendium.${pack.id}.Item.${itemIndex._id}`;
                    log(`[findItem] Found in pack ${pack.metadata.label || pack.id}: ${uuid}`);
                    return await client.fetchByUuid(uuid);
                }
            }

            // 3. Fallback: parentheses cleanup
            const cleanName = itemName.replace(/\s*\(.*?\)\s*/g, '').trim();
            if (cleanName && cleanName !== itemName) {
                log(`[findItem] Trying fallback search with: '${cleanName}'`);
                for (const pack of packs) {
                    const itemIndex = pack.index.find((i: any) =>
                        (i.name.toLowerCase() === cleanName.toLowerCase()) &&
                        (i.type.toLowerCase() === type.toLowerCase())
                    );
                    if (itemIndex) {
                        const uuid = itemIndex.uuid || `Compendium.${pack.id}.Item.${itemIndex._id}`;
                        log(`[findItem] Fallback Match in pack ${pack.metadata.label || pack.id}: ${uuid}`);
                        return await client.fetchByUuid(uuid);
                    }
                }
            }

            if (!silent) {
                log(`[findItem] FAILED to find '${itemName}'`);
                errors.push({ type, name: itemName, error: 'Not found' });
            }
            return null;
        };

        const findSpell = async (spellData: any, classList: any[]) => {
            log(`[findSpell] Searching for '${spellData.bonusName}' (Source: ${spellData.sourceName})`);

            const classObj = classList.find(c => c.name.toLowerCase() === spellData.sourceName.toLowerCase());

            // Strict Search (Class Match)
            if (classObj) {
                for (const pack of packs) {
                    const itemIndex = pack.index.find((s: any) =>
                        (s.name.toLowerCase() === spellData.bonusName.toLowerCase()) &&
                        (s.type === 'Spell')
                        // Note: Index might not have 'system.class', so this check might fail if index is shallow.
                        // We might need to fetch if name matches to verify class, but that's expensive.
                        // For now, let's assume if name matches in the index, we check it.
                    );

                    if (itemIndex) {
                        const uuid = itemIndex.uuid || `Compendium.${pack.id}.Item.${itemIndex._id}`;
                        const item = await client.fetchByUuid(uuid);
                        if (item && item.system?.class && item.system.class.includes(classObj._id)) { // UUID check? 
                            // Wait, classObj from findItem is the doc. system.class stores strings? likely UUIDs or names.
                            // Shadowdark system stores Class UUIDs in spell.system.class array.
                            // classObj is the fetched Item.
                            // We should check if item.system.class includes classObj._id or classObj.uuid (if available)
                            // Re-fetching confirms logic.
                            log(`[findSpell] Found and verified class match: ${item.name}`);
                            return item;
                        }
                    }
                }
            }

            // Fallback: Loose Search (Name only)
            log(`[findSpell] Strict class match failed for '${spellData.bonusName}', trying loose name search...`);
            for (const pack of packs) {
                const itemIndex = pack.index.find((s: any) =>
                    (s.name.toLowerCase() === spellData.bonusName.toLowerCase()) &&
                    (s.type === 'Spell')
                );

                if (itemIndex) {
                    const uuid = itemIndex.uuid || `Compendium.${pack.id}.Item.${itemIndex._id}`;
                    log(`[findSpell] Fallback Match in pack ${pack.metadata.label || pack.id}: ${uuid}`);
                    return await client.fetchByUuid(uuid);
                }
            }

            log(`[findSpell] FAILED to find '${spellData.bonusName}'`);
            errors.push({ type: 'Spell', name: spellData.bonusName, error: 'Not found' });
            return null;
        };

        const findTalent = async (bonus: any) => {
            log(`[findTalent] Processing bonus '${bonus.name}' (Name: ${bonus.bonusName}, To: ${bonus.bonusTo})`);
            let patternStr = "";
            const mBonus = this.mapping?.bonus;

            if (!mBonus) {
                errors.push({ type: 'Talent', name: bonus.name, error: 'Mapping missing item' });
                return null;
            }

            if (mBonus[`${bonus.bonusName}_${bonus.bonusTo}`]) patternStr = `${bonus.bonusName}_${bonus.bonusTo}`;
            else if (mBonus[bonus.bonusName]) patternStr = bonus.bonusName;
            else if (mBonus[`${bonus.bonusTo}_${bonus.bonusName}`]) patternStr = `${bonus.bonusTo}_${bonus.bonusName}`;
            else if (mBonus[bonus.bonusTo]) patternStr = bonus.bonusTo;

            let foundTalent = null;
            if (patternStr) {
                const uuid = mBonus[patternStr];
                foundTalent = await client.fetchByUuid(uuid);
            }

            if (!foundTalent) {
                let searchName = bonus.name;
                // Special Handling: Kobold Knacks
                if (searchName === 'Knack' && bonus.bonusName === 'LuckTokenAtStartOfSession') {
                    searchName = 'Knack (Luck)';
                }

                log(`[findTalent] Mapping failed, trying dynamic search for '${searchName}'...`);
                foundTalent = await findItem(searchName, 'Talent', true) || await findItem(searchName, 'Feature', true);
            }

            if (foundTalent) {
                // Clone to avoid mutating cached object if fetchByUuid returns cache reference
                // CoreSocket usually returns fresh object from JSON parse, but valid to be safe.
                foundTalent = JSON.parse(JSON.stringify(foundTalent));

                if (foundTalent.system?.talentClass === "level") foundTalent.system.level = bonus.gainedAtLevel;

                if (foundTalent.effects?.[0]?.changes?.[0]?.value === "REPLACEME") {
                    let val = "";
                    if (mBonus[bonus.bonusName]) val = bonus.bonusTo;
                    else if (mBonus[bonus.bonusTo]) val = bonus.bonusName;

                    if (val) {
                        val = val.replace(/\b\w/g, (s: string) => s.toUpperCase());
                        foundTalent.name += ` (${val})`;
                        if (foundTalent.effects[0].changes) {
                            foundTalent.effects[0].changes[0].value = val.replace(/\s+/g, "-").toLowerCase();
                        }
                    }
                }

                if (bonus.sourceCategory === "Boon") foundTalent.name += ` [${bonus.boonPatron}]`;
                if (bonus.sourceCategory?.startsWith("BlackLotusTalent")) foundTalent.name += " [BlackLotus]";

                return foundTalent;
            } else {
                log(`[findTalent] FAILED to find talent for '${bonus.name}'`);
                errors.push({ type: 'Talent', name: bonus.name, error: 'Not found' });
                return null;
            }
        };

        const findGenericIcon = async (keyword: string, type: string = 'Basic'): Promise<string | null> => {
            log(`[findGenericIcon] Searching for icon with keyword '${keyword}'`);

            for (const pack of packs) {
                const matchIndex = pack.index.find((i: any) =>
                    i.name.toLowerCase().includes(keyword.toLowerCase()) &&
                    (!type || i.type.toLowerCase() === type.toLowerCase())
                );

                if (matchIndex && matchIndex.img) {
                    return matchIndex.img;
                }
                // If index doesn't have img, we might need to fetch. 
                // Creating a custom item, we really just want an icon.
                // CoreSocket index *should* have img if available.
            }
            return null;
        };

        const getClassList = async () => {
            const classes = [];
            for (const pack of packs) {
                const classIndices = pack.index.filter((i: any) => i.type === 'Class');
                for (const idx of classIndices) {
                    const uuid = idx.uuid || `Compendium.${pack.id}.Item.${idx._id}`;
                    const doc = await client.fetchByUuid(uuid);
                    if (doc) classes.push(doc);
                }
            }
            return classes;
        };


        // --- MAIN LOGIC ---

        try {
            // 1. Prepare Actor Data
            const actorData: any = {
                name: json.name || "Unnamed",
                type: "Player",
                system: {
                    abilities: {
                        str: { base: json.rolledStats.STR, bonus: 0 },
                        dex: { base: json.rolledStats.DEX, bonus: 0 },
                        con: { base: json.rolledStats.CON, bonus: 0 },
                        int: { base: json.rolledStats.INT, bonus: 0 },
                        wis: { base: json.rolledStats.WIS, bonus: 0 },
                        cha: { base: json.rolledStats.CHA, bonus: 0 }
                    },
                    alignment: (json.alignment || 'neutral').toLowerCase(),
                    attributes: {
                        hp: {
                            value: json.maxHitPoints,
                            max: json.maxHitPoints,
                            base: (json.ancestry === "Dwarf") ? json.maxHitPoints - 2 : json.maxHitPoints
                        }
                    },
                    coins: {
                        gp: json.gold || 0,
                        sp: json.silver || 0,
                        cp: json.copper || 0
                    },
                    level: {
                        value: json.level || 1,
                        xp: json.XP || 0
                    },
                    slots: json.gearSlotsTotal || 10,
                    languages: [] // Will populate UUIDs
                }
            };

            // Calculate Mods
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
                const base = actorData.system.abilities[k].base;
                actorData.system.abilities[k].mod = Math.floor((base - 10) / 2);
            });

            // 2. Fetch Core Items
            const ancestry = await findItem(json.ancestry, "Ancestry");
            if (ancestry) actorData.system.ancestry = ancestry._id; // Use ID or UUID? System expects UUID usually? 
            // Wait, Shadowdark system fields for ancestry/class/etc differ. 
            // In Generator it seemed we push Items embedded, but also link UUIDs?
            // The logic in original importer: ancestry.uuid.
            // Let's assume UUID is correct for system links.
            if (ancestry) actorData.system.ancestry = ancestry.uuid || `Item.${ancestry._id}`; // We'll assume UUID. If imported, might be different.

            const background = await findItem(json.background, "Background");
            if (background) actorData.system.background = background.uuid || `Item.${background._id}`;

            const deity = await findItem(json.deity, "Deity");
            if (deity) actorData.system.deity = deity.uuid || `Item.${deity._id}`;

            // Patron
            let patronName = json.patron;
            if (!patronName && json.bonuses) {
                const patronBonus = json.bonuses.find((b: any) => b.sourceCategory === 'Patron' && b.name === 'Patron');
                if (patronBonus) patronName = patronBonus.bonusTo;
            }
            if (patronName) {
                const patron = await findItem(patronName, "Patron");
                if (patron) actorData.system.patron = patron.uuid || `Item.${patron._id}`;
            }

            // Languages
            if (json.languages) {
                for (const lang of json.languages.split(/\s*,\s*/)) {
                    const found = await findItem(lang, "Language");
                    if (found) actorData.system.languages.push(found.uuid || `Item.${found._id}`);
                }
            }

            // Class
            const classList = await getClassList();
            const classObj = await findItem(json.class, "Class");
            if (classObj) {
                actorData.system.class = classObj.uuid || `Item.${classObj._id}`;

                // Starting Spells
                if (classObj.system?.startingSpells) {
                    for (const uuid of classObj.system.startingSpells) {
                        const item = await client.fetchByUuid(uuid);
                        if (item) spells.push(item);
                    }
                }

                // Fixed Class Talents
                if (classObj.system?.talents) {
                    for (const uuid of classObj.system.talents) {
                        const item = await client.fetchByUuid(uuid);
                        if (item) {
                            const obj = JSON.parse(JSON.stringify(item));
                            const exists = talents.find(t => t.name === obj.name);
                            if (!exists) {
                                if (obj.effects?.[0]?.changes?.[0]?.value !== "REPLACEME") {
                                    talents.push(obj);
                                }
                            }
                        }
                    }
                }
            }

            // 3. Gear
            if (json.gear) {
                for (const g of json.gear) {
                    const type = g.type === 'sundry' ? 'basic' : g.type;
                    if (g.name === "Coins") continue;

                    log(`Processing Gear: ${g.name} (Type: ${type})`);
                    const item = await findItem(g.name, type);
                    if (item) {
                        log(`Found: ${item.name}`);
                        const itemData = JSON.parse(JSON.stringify(item));
                        if (itemData.system) itemData.system.quantity = g.quantity;
                        gear.push(itemData);
                    } else {
                        // Fallback: Create Custom Item
                        if (type === 'basic' || type === 'sundry' || g.type === 'sundry') {
                            log(`[Gear] Generating custom item: ${g.name}`);
                            const isScroll = g.name.toLowerCase().includes('scroll');
                            const isPotion = g.name.toLowerCase().includes('potion');
                            const isWand = g.name.toLowerCase().includes('wand');

                            let img = "icons/containers/beakers/jar-corked-brown.webp";
                            let dynamicIcon = null;
                            if (isScroll) dynamicIcon = await findGenericIcon('Scroll', 'Basic');
                            else if (isPotion) dynamicIcon = await findGenericIcon('Potion', 'Basic');
                            else if (isWand) dynamicIcon = await findGenericIcon('Wand', 'Basic');

                            if (dynamicIcon) img = dynamicIcon;
                            else {
                                if (isScroll) img = "icons/consumables/scrolls/scroll-runed-blue.webp";
                                else if (isPotion) img = "icons/consumables/potions/potion-bottle-corked-blue.webp";
                                else if (isWand) img = "icons/tools/wands/wand-wood.webp";
                            }

                            gear.push({
                                name: g.name,
                                type: "Basic",
                                img: img,
                                system: {
                                    description: `<strong>${g.name}</strong>`,
                                    stored: false,
                                    slots: { slots_used: g.slots || (isScroll ? 0 : 1), per_slot: 1, free_carry: 0 },
                                    quantity: g.quantity || 1,
                                    cost: { gp: 0 },
                                    treasure: false,
                                    isPhysical: true,
                                    light: { isSource: false }
                                }
                            });
                            warnings.push(`Created Custom Gear Item: '${g.name}'`);
                        } else {
                            log(`Failed to find: ${g.name}`);
                            errors.push({ type, name: g.name, error: 'Not found' });
                        }
                    }
                }
            }

            // Treasure
            if (json.treasures) {
                for (const t of json.treasures) {
                    gear.push({
                        name: t.name,
                        type: "Basic",
                        img: "icons/commodities/treasure/chest-wooden-closed.webp",
                        system: {
                            description: `<p>${t.desc}</p>`,
                            cost: { [t.currency]: t.cost },
                            slots: { slots_used: t.slots },
                            treasure: true,
                            quantity: 1
                        }
                    });
                }
            }

            // Magic Items
            if (json.magicItems) {
                for (const m of json.magicItems) {
                    let type = 'basic';
                    if (m.magicItemType === 'magicWeapon') type = 'weapon';
                    else if (m.magicItemType === 'magicArmor') type = 'armor';

                    log(`Processing Magic Item: ${m.name} (Type: ${type})`);
                    let item = await findItem(m.name, type, true);
                    if (!item) {
                        const baseName = m.name.replace(/\s*\+\d+/, '').trim();
                        if (baseName !== m.name) {
                            item = await findItem(baseName, type, true);
                            if (item) warnings.push(`Adapted Magic Item: '${m.name}' from '${item.name}'`);
                        }
                    }

                    if (item) {
                        const itemData = JSON.parse(JSON.stringify(item));
                        itemData.name = m.name;
                        if (itemData.system) {
                            if (m.bonus) {
                                if (type === 'weapon') itemData.system.bonus = { ...itemData.system.bonus, attack: m.bonus, damage: m.bonus };
                                if (type === 'armor') itemData.system.ac = { ...itemData.system.ac, value: (itemData.system.ac?.value || 0) + m.bonus };
                            }
                            if (m.slots) itemData.system.slots.slots_used = m.slots;
                        }
                        gear.push(itemData);
                    } else {
                        // Fallback Custom
                        if (type === 'basic' || type === 'sundry' || m.itemType === 'sundry') {
                            log(`[MagicItem] Generating custom item: ${m.name}`);
                            const isScroll = m.name.toLowerCase().includes('scroll');
                            let img = "icons/containers/beakers/jar-corked-brown.webp";

                            const dynamicIcon = isScroll ? await findGenericIcon('Scroll', 'Basic') : null;
                            if (dynamicIcon) img = dynamicIcon;
                            else if (isScroll) img = "icons/consumables/scrolls/scroll-runed-blue.webp";

                            let desc = `<strong>${m.name}</strong>`;
                            if (m.features) desc += `<br><p>${m.features}</p>`;
                            if (m.spellDesc) desc += `<br><p><strong>Spell Effect:</strong> ${m.spellDesc}</p>`;
                            if (m.benefits) desc += `<br><p><strong>Benefits:</strong> ${m.benefits}</p>`;
                            if (m.curses) desc += `<br><p><strong>Curse:</strong> ${m.curses}</p>`;

                            gear.push({
                                name: m.name,
                                type: "Basic",
                                img: img,
                                system: {
                                    description: desc,
                                    stored: false,
                                    slots: { slots_used: m.slots || (isScroll ? 0 : 1), per_slot: 1, free_carry: 0 },
                                    quantity: 1,
                                    cost: { gp: 0 },
                                    treasure: false,
                                    isPhysical: true,
                                    light: { isSource: false }
                                }
                            });
                            warnings.push(`Created Custom Magic Item: '${m.name}'`);
                        } else {
                            log(`Failed to find Magic Item: ${m.name}`);
                            errors.push({ type, name: m.name, error: 'Not found' });
                        }
                    }
                }
            }


            // 4. Bonuses (Talents & Spells)
            if (json.bonuses) {
                for (const bonus of json.bonuses) {
                    if (/^ExtraLanguage:/.test(bonus.name)) continue;
                    if (/^ExtraLanguageManual:/.test(bonus.name)) continue;
                    if (/^GrantSpecialTalent:/.test(bonus.name)) continue;
                    if (bonus.sourceCategory === 'Patron' && bonus.name === 'Patron') continue;
                    if (this.mapping.ignoreTalents?.includes(bonus.name)) continue;

                    if (bonus.name === "SetWeaponTypeDamage") bonus.bonusTo = bonus.bonusTo.split(":")[0];

                    if (/^Spell:/.test(bonus.name)) {
                        const spell = await findSpell(bonus, classList);
                        if (spell) spells.push(spell);
                        continue;
                    }

                    const talent = await findTalent(bonus);
                    if (talent) talents.push(talent);
                }
            }

            // 5. Create Actor
            log(`[Importer] Creating Actor ${actorData.name}...`);
            const createdActor = await client.createActor(actorData);
            if (!createdActor) throw new Error("Failed to create Actor document");

            log(`[Importer] Actor Created: ${createdActor._id}`);

            // Embed Items
            const allItems = [...gear, ...classAbilities, ...spells, ...talents].filter(i => i.type !== 'Class');

            // SANITIZATION
            if (SYSTEM_PREDEFINED_EFFECTS) {
                for (const item of allItems) {
                    if (item.effects && Array.isArray(item.effects) && item.effects.length > 0 && typeof item.effects[0] === 'string') {
                        log(`[Sanitizer] Clearing invalid string effects for ${item.name}`);
                        item.effects = [];

                        const name = (item.name || "").toLowerCase();
                        const predefinedMatch = Object.values(SYSTEM_PREDEFINED_EFFECTS).find((def: any) =>
                            name.includes(def.label.toLowerCase()) ||
                            def.label.toLowerCase().includes(name)
                        );

                        if (predefinedMatch) {
                            log(`[Sanitizer] Polyfilling effect ${predefinedMatch.label} for ${item.name}`);
                            item.effects.push({
                                name: predefinedMatch.label,
                                icon: predefinedMatch.icon || "icons/svg/aura.svg",
                                changes: predefinedMatch.changes || [{
                                    key: predefinedMatch.key,
                                    mode: predefinedMatch.mode,
                                    value: predefinedMatch.value
                                }],
                                transfer: true,
                                disabled: false,
                                _id: Math.random().toString(36).substring(2, 15)
                            });
                        }
                    }
                }
            }

            if (allItems.length > 0) {
                log(`[Importer] Creating ${allItems.length} embedded items...`);
                await client.createActorItem(createdActor._id, allItems);
            }

            return { success: true, id: createdActor._id, errors: errors.length > 0 ? errors : undefined, warnings: warnings.length > 0 ? warnings : undefined, debug: debugLog };

        } catch (e: any) {
            log(`[Importer] Critical Error: ${e.message}`);
            return { success: false, errors: [e.message, e.stack], warnings: warnings, debug: debugLog };
        }
    }
}
