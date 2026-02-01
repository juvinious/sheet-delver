
import { FoundryClient } from '@/lib/foundry';
import fs from 'fs';
import path from 'path';

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
        if (!client.isConnected) {
            return { success: false, errors: ['Not connected to Foundry'] };
        }

        // We run the complex logic inside the browser
        return await client.evaluate(async ({ json, mapping }: { json: any, mapping: any }) => {
            const debugLog: string[] = [];
            const log = (msg: string) => debugLog.push(msg);

            log(`[Importer] Starting Import. Name: ${json.name}`);

            const errors: any[] = [];
            const warnings: string[] = [];
            const gear: any[] = [];
            const spells: any[] = [];
            const talents: any[] = [];
            const classAbilities: any[] = [];

            // --- HELPER FUNCTIONS ---
            const findItem = async (itemName: string, type: string, silent: boolean = false) => {
                log(`[findItem] Searching for '${itemName}' in '${type}'`);

                // 1. Check mapping
                // @ts-ignore
                const mappingCategory = mapping?.[type.toLowerCase()];
                let itemUuid = mappingCategory?.[itemName];

                // Case-insensitive fallback for mapping
                if (!itemUuid && mappingCategory) {
                    const key = Object.keys(mappingCategory).find(k => k.toLowerCase() === itemName.toLowerCase());
                    if (key) {
                        itemUuid = mappingCategory[key];
                        log(`[findItem] Fuzzy mapping match: '${itemName}' -> '${key}'`);
                    }
                }

                // @ts-ignore
                if (itemUuid) {
                    log(`[findItem] Found in mapping: ${itemUuid}`);
                    // @ts-ignore
                    const item = await fromUuid(itemUuid);
                    if (item) return item;
                    log(`[findItem] WARN: Mapping UUID ${itemUuid} could not be resolved`);
                }

                // 2. Scan packs (Exact match)
                log(`[findItem] Scanning packs for exact match...`);
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;
                    // @ts-ignore
                    const itemIndex = pack.index.find((i: any) =>
                        (i.name.toLowerCase() === itemName.toLowerCase()) &&
                        (i.type.toLowerCase() === type.toLowerCase())
                    );
                    if (itemIndex) {
                        log(`[findItem] Found in pack ${pack.metadata.label}: ${itemIndex._id}`);
                        return pack.getDocument(itemIndex._id);
                    }
                }

                // 3. Fallback: parentheses cleanup (e.g. "Light (Torch)" -> "Light", or "Torch"?) 
                // Shadowdarkling exports formatted variants sometimes.
                // Let's try checking if the itemName contains the pack item name or vice versa? 
                // For now, let's try stripping parentheses.
                const cleanName = itemName.replace(/\s*\(.*?\)\s*/g, '').trim();
                if (cleanName && cleanName !== itemName) {
                    log(`[findItem] Trying fallback search with: '${cleanName}'`);
                    // @ts-ignore
                    for (const pack of game.packs) {
                        if (pack.metadata.type !== 'Item') continue;
                        // @ts-ignore
                        const itemIndex = pack.index.find((i: any) =>
                            (i.name.toLowerCase() === cleanName.toLowerCase()) &&
                            (i.type.toLowerCase() === type.toLowerCase())
                        );
                        if (itemIndex) {
                            log(`[findItem] Fallback Match in pack ${pack.metadata.label}: ${itemIndex._id}`);
                            return pack.getDocument(itemIndex._id);
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
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;

                    const classObj = classList.find(c => c.name.toLowerCase() === spellData.sourceName.toLowerCase());

                    // @ts-ignore
                    const itemIndex = pack.index.find((s: any) =>
                        (s.name.toLowerCase() === spellData.bonusName.toLowerCase()) &&
                        (s.type === 'Spell') &&
                        // Loose matching for class association if specific UUID logic is hard
                        // But let's try to match logic: s.system.class.includes(classObj.uuid)
                        (classObj ? (s.system.class && s.system.class.includes(classObj.uuid)) : true)
                    );

                    if (itemIndex) {
                        log(`[findSpell] Found in pack ${pack.metadata.label}: ${itemIndex._id}`);
                        return pack.getDocument(itemIndex._id);
                    }
                }

                // Fallback: Search by Name only (ignore Class restriction)
                log(`[findSpell] Strict class match failed for '${spellData.bonusName}', trying loose name search...`);
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;
                    // @ts-ignore
                    const itemIndex = pack.index.find((s: any) =>
                        (s.name.toLowerCase() === spellData.bonusName.toLowerCase()) &&
                        (s.type === 'Spell')
                    );

                    if (itemIndex) {
                        log(`[findSpell] Fallback Match in pack ${pack.metadata.label}: ${itemIndex._id}`);
                        return pack.getDocument(itemIndex._id);
                    }
                }
                log(`[findSpell] FAILED to find '${spellData.bonusName}'`);
                errors.push({ type: 'Spell', name: spellData.bonusName, error: 'Not found' });
                return null;
            };

            const findTalent = async (bonus: any) => {
                log(`[findTalent] Processing bonus '${bonus.name}' (Name: ${bonus.bonusName}, To: ${bonus.bonusTo})`);
                let patternStr = "";
                // @ts-ignore
                // @ts-ignore
                const mBonus = mapping.bonus;
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
                    // @ts-ignore
                    foundTalent = await fromUuid(mBonus[patternStr]);
                }

                // Fallback: Search by name if mapping failed
                if (!foundTalent) {
                    let searchName = bonus.name;

                    // Special Handling: Kobold Knacks
                    if (searchName === 'Knack' && bonus.bonusName === 'LuckTokenAtStartOfSession') {
                        searchName = 'Knack (Luck)';
                    }

                    log(`[findTalent] Mapping failed for '${bonus.name}', trying dynamic search for '${searchName}'...`);
                    // Try Talent, then Feature (some systems use Feature for racial abilities)
                    foundTalent = await findItem(searchName, 'Talent', true) || await findItem(searchName, 'Feature', true);
                }

                if (foundTalent) {
                    log(`[findTalent] Found talent: ${foundTalent.name}`);
                    foundTalent = foundTalent.toObject();
                    // Customize
                    if (foundTalent.system.talentClass === "level") foundTalent.system.level = bonus.gainedAtLevel;

                    // REPLACEME logic
                    if (foundTalent.effects?.[0]?.changes?.[0]?.value === "REPLACEME") {
                        let val = "";
                        if (mBonus[bonus.bonusName]) val = bonus.bonusTo; // Pattern 2 implies bonusTo is the value
                        else if (mBonus[bonus.bonusTo]) val = bonus.bonusName; // Pattern 4 implies bonusName is value

                        if (val) {
                            // Title Case
                            val = val.replace(/\b\w/g, (s: string) => s.toUpperCase());
                            foundTalent.name += ` (${val})`;
                            foundTalent.effects[0].changes[0].value = val.replace(/\s+/g, "-").toLowerCase();
                        }
                    }

                    if (bonus.sourceCategory === "Boon") foundTalent.name += ` [${bonus.boonPatron}]`;
                    if (bonus.sourceCategory?.startsWith("BlackLotusTalent")) foundTalent.name += " [BlackLotus]";

                    return foundTalent;
                } else {
                    log(`[findTalent] FAILED to find talent for '${bonus.name}' (Pattern: ${patternStr})`);
                    errors.push({ type: 'Talent', name: bonus.name, error: 'Not found' });
                    return null;
                }
            };

            const findGenericIcon = async (keyword: string, type: string = 'Basic'): Promise<string | null> => {
                log(`[findGenericIcon] Searching for icon with keyword '${keyword}'`);
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;
                    // @ts-ignore
                    // We can't trust index has img, so we find a match then fetch
                    const matchIndex = pack.index.find((i: any) =>
                        i.name.toLowerCase().includes(keyword.toLowerCase()) &&
                        (!type || i.type.toLowerCase() === type.toLowerCase())
                    );

                    if (matchIndex) {
                        try {
                            const doc = await pack.getDocument(matchIndex._id);
                            if (doc && doc.img) {
                                log(`[findGenericIcon] Found icon: ${doc.img} from ${doc.name}`);
                                return doc.img;
                            }
                        } catch { /* ignore */ }
                    }
                }
                return null;
            };

            const getClassList = async () => {
                const classes = [];
                // @ts-ignore
                for (const pack of game.packs) {
                    if (pack.metadata.type !== 'Item') continue;
                    // @ts-ignore
                    const index = pack.index.filter((i: any) => i.type === 'Class');
                    for (const i of index) {
                        // @ts-ignore
                        const doc = await pack.getDocument(i._id);
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

                // 2. Fetch Core Items (Ancestry, Background, Class, Deity) using Helpers
                // We need to resolve these to UUIDs
                const ancestry = await findItem(json.ancestry, "Ancestry");
                if (ancestry) actorData.system.ancestry = ancestry.uuid;

                const background = await findItem(json.background, "Background");
                if (background) actorData.system.background = background.uuid;

                const deity = await findItem(json.deity, "Deity");
                if (deity) actorData.system.deity = deity.uuid;

                // Patron (For Warlocks etc)
                let patronName = json.patron;
                if (!patronName && json.bonuses) {
                    const patronBonus = json.bonuses.find((b: any) => b.sourceCategory === 'Patron' && b.name === 'Patron');
                    if (patronBonus) {
                        patronName = patronBonus.bonusTo;
                    }
                }

                if (patronName) {
                    const patron = await findItem(patronName, "Patron");
                    if (patron) actorData.system.patron = patron.uuid;
                }

                // Languages
                if (json.languages) {
                    for (const lang of json.languages.split(/\s*,\s*/)) {
                        const found = await findItem(lang, "Language");
                        if (found) actorData.system.languages.push(found.uuid);
                    }
                }

                // Class (Needed for spells/abilities)
                // Need full class list first for spell matching
                // @ts-ignore
                const classList = await getClassList();
                const classObj = await findItem(json.class, "Class");
                if (classObj) {
                    actorData.system.class = classObj.uuid;

                    // Class Abilities
                    // NOTE: Disabled explicit expansion because 'bonuses' array usually contains these,
                    // and duplications occur if we add them here.
                    /*
                    if (classObj.system?.classAbilities) {
                        for (const uuid of classObj.system.classAbilities) {
                            // @ts-ignore
                            const item = await fromUuid(uuid);
                            if (item) classAbilities.push(item.toObject());
                        }
                    }
                    */

                    // Starting Spells
                    if (classObj.system?.startingSpells) {
                        for (const uuid of classObj.system.startingSpells) {
                            // @ts-ignore
                            const item = await fromUuid(uuid);
                            if (item) spells.push(item.toObject());
                        }
                    }

                    // Fixed Class Talents
                    if (classObj.system?.talents) {
                        for (const uuid of classObj.system.talents) {
                            // @ts-ignore
                            const item = await fromUuid(uuid);
                            if (item) {
                                const obj = item.toObject();

                                // Avoid duplicates if already added via bonuses
                                const exists = talents.find(t => t.name === obj.name);
                                if (exists) continue;

                                // Exclude replacement choices (handled by Level 0 logic or manual selection usually)
                                // but for Level 1 creation we want base talents.
                                // If it has REPLACEME, strictly skip? Shadowdarkling might have provided the choice result.
                                if (obj.effects?.[0]?.changes?.[0]?.value !== "REPLACEME") {
                                    talents.push(obj);
                                }
                            }
                        }
                    }
                }

                // Fixed Ancestry Talents
                /*
                if (ancestry && ancestry.system?.talents) {
                    for (const uuid of ancestry.system.talents) {
                        // @ts-ignore
                        const item = await fromUuid(uuid);
                        if (item) {
                            const obj = item.toObject();
                            if (obj.effects?.[0]?.changes?.[0]?.value !== "REPLACEME") {
                                talents.push(obj);
                            }
                        }
                    }
                }
                */


                // 3. Gear
                if (json.gear) {
                    for (const g of json.gear) {
                        const type = g.type === 'sundry' ? 'basic' : g.type;
                        if (g.name === "Coins") continue;

                        log(`Processing Gear: ${g.name} (Type: ${type})`);
                        const item = await findItem(g.name, type);
                        if (item) {
                            // Found it!
                            log(`Found: ${item.name}`); // Use short log
                            const itemData = item.toObject();
                            if (itemData.system) itemData.system.quantity = g.quantity;
                            gear.push(itemData);
                        } else {
                            // Manual Error push since we silenced findItem
                            // FALLBACK: Create Custom Item (e.g. Scrolls)
                            // If we have enough data, we can create a usable item instead of failing.
                            if (type === 'basic' || type === 'sundry' || g.type === 'sundry') {
                                log(`[Gear] Not found in packs. generating custom item: ${g.name}`);

                                const isScroll = g.name.toLowerCase().includes('scroll');
                                const isPotion = g.name.toLowerCase().includes('potion');
                                const isWand = g.name.toLowerCase().includes('wand');

                                let img = "icons/containers/beakers/jar-corked-brown.webp"; // Generic sundries backup

                                // Dynamic Icon Lookup
                                let dynamicIcon = null;
                                if (isScroll) dynamicIcon = await findGenericIcon('Scroll', 'Basic');
                                else if (isPotion) dynamicIcon = await findGenericIcon('Potion', 'Basic');
                                else if (isWand) dynamicIcon = await findGenericIcon('Wand', 'Basic');

                                // Fallback if no dynamic icon found, OR if strictly desired to attempt simple name match?
                                // If simple name match failed earlier (findItem), we probably won't find it here by name.
                                // But filtering by "Scroll" keyword generally works.

                                if (dynamicIcon) img = dynamicIcon;
                                else {
                                    // Hardcoded modern fallbacks if dynamic fails
                                    if (isScroll) img = "icons/consumables/scrolls/scroll-runed-blue.webp";
                                    else if (isPotion) img = "icons/consumables/potions/potion-bottle-corked-blue.webp";
                                    else if (isWand) img = "icons/tools/wands/wand-wood.webp";
                                }

                                const desc = `<strong>${g.name}</strong>`;
                                // Check if we have extras on basic gear? Shadowdarkling basic gear usually doesn't have features unless it's a magic item disguised as sundry.
                                // But 'g' here comes from json.gear which is sometimes limited.
                                // If this was triggered from the Magic Items loop (below), we have more data 'm'.
                                // Wait, this block is for GEAR.

                                gear.push({
                                    name: g.name,
                                    type: "Basic",
                                    img: img,
                                    system: {
                                        description: desc,
                                        stored: false,
                                        slots: {
                                            slots_used: g.slots || (isScroll ? 0 : 1),
                                            per_slot: 1,
                                            free_carry: 0
                                        },
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
                            img: "icons/commodities/treasure/chest-wooden-closed.webp", // Generic icon
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
                        // Others?

                        log(`Processing Magic Item: ${m.name} (Type: ${type})`);

                        // Try finding base item if name includes +1?
                        // Actually, let's trust the name first.
                        // Silent because if we don't find "Spear+1", we don't want an error yet.
                        let item = await findItem(m.name, type, true);

                        if (!item) {
                            // Fallback: Try searching for base item (e.g. "Spear+1" -> "Spear")
                            // This is relevant because Foundry items might just be "Spear" and we modify them
                            const baseName = m.name.replace(/\s*\+\d+/, '').trim();
                            if (baseName !== m.name) {
                                log(`[MagicItem] Trying base name search: '${baseName}'`);
                                // Silent finding base item, because if this fails, we want to report the ORIGINAL name error, not "Spear" error
                                item = await findItem(baseName, type, true);
                                if (item) {
                                    warnings.push(`Adapted Magic Item: '${m.name}' created from '${item.name}'`);
                                }
                            }
                        }

                        if (item) {
                            log(`Found Magic Item: ${item.name}`);
                            const itemData = item.toObject();
                            itemData.name = m.name; // Ensure +1 name is kept

                            // Apply Magic bonuses if possible?
                            // Shadowdark system might have a bonus field, but for now we just map the item.
                            if (itemData.system) {
                                if (m.bonus) {
                                    if (type === 'weapon') {
                                        itemData.system.bonus = { ...itemData.system.bonus, attack: m.bonus, damage: m.bonus };
                                    }
                                    if (type === 'armor') {
                                        itemData.system.ac = { ...itemData.system.ac, value: (itemData.system.ac?.value || 0) + m.bonus };
                                    }
                                }
                                if (m.slots) itemData.system.slots.slots_used = m.slots;
                            }
                            gear.push(itemData);
                        } else {
                            // Manual Error push since we silenced findItem
                            // FALLBACK: Create Custom Item (e.g. Scrolls)
                            // If we have enough data, we can create a usable item instead of failing.
                            if (type === 'basic' || type === 'sundry' || m.itemType === 'sundry') {
                                log(`[MagicItem] Not found in packs. generating custom item: ${m.name}`);

                                const isScroll = m.name.toLowerCase().includes('scroll');
                                const isPotion = m.name.toLowerCase().includes('potion');
                                const isWand = m.name.toLowerCase().includes('wand');

                                let img = "icons/containers/beakers/jar-corked-brown.webp"; // Generic sundries backup

                                // Dynamic Icon Lookup
                                let dynamicIcon = null;
                                if (isScroll) dynamicIcon = await findGenericIcon('Scroll', 'Basic');
                                else if (isPotion) dynamicIcon = await findGenericIcon('Potion', 'Basic');
                                else if (isWand) dynamicIcon = await findGenericIcon('Wand', 'Basic');

                                if (dynamicIcon) img = dynamicIcon;
                                else {
                                    // Hardcoded modern fallbacks if dynamic fails
                                    if (isScroll) img = "icons/consumables/scrolls/scroll-runed-blue.webp";
                                    else if (isPotion) img = "icons/consumables/potions/potion-bottle-corked-blue.webp";
                                    else if (isWand) img = "icons/tools/wands/wand-wood.webp";
                                }

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
                                        slots: {
                                            slots_used: m.slots || (isScroll ? 0 : 1),
                                            per_slot: 1,
                                            free_carry: 0
                                        },
                                        quantity: 1,
                                        cost: { gp: 0 },
                                        treasure: false,
                                        isPhysical: true,
                                        light: { isSource: false }
                                    }
                                });
                                // Don't push error if we successfully handled it
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
                        // Filters
                        if (/^ExtraLanguage:/.test(bonus.name)) continue;
                        if (/^ExtraLanguageManual:/.test(bonus.name)) continue;
                        if (/^GrantSpecialTalent:/.test(bonus.name)) continue;
                        if (bonus.sourceCategory === 'Patron' && bonus.name === 'Patron') continue; // Handled in Actor Setup
                        // @ts-ignore
                        if (mapping.ignoreTalents?.includes(bonus.name)) continue;

                        // Fix Ranger Damage
                        if (bonus.name === "SetWeaponTypeDamage") {
                            bonus.bonusTo = bonus.bonusTo.split(":")[0];
                        }

                        // Handle Spells
                        if (/^Spell:/.test(bonus.name)) {
                            const spell = await findSpell(bonus, classList);
                            if (spell) spells.push(spell.toObject());
                            continue;
                        }

                        // Handle Talents
                        const talent = await findTalent(bonus);
                        if (talent) talents.push(talent);
                    }
                }


                // 5. Create Actor
                // @ts-ignore
                const newActor = await window.Actor.create(actorData);

                // Embed Items
                // Ensure we don't accidentally add a Class item (since the System might have auto-created one, or we want to rely on system.class)
                const allItems = [...gear, ...classAbilities, ...spells, ...talents].filter(i => i.type !== 'Class');

                if (allItems.length > 0) {
                    // @ts-ignore
                    await newActor.createEmbeddedDocuments("Item", allItems);
                }

                return { success: true, id: newActor.id, errors: errors.length > 0 ? errors : undefined, warnings: warnings.length > 0 ? warnings : undefined, debug: debugLog };

            } catch (e: any) {
                return { success: false, errors: [e.message, e.stack], warnings: warnings, debug: debugLog };
            }

        }, { json, mapping: this.mapping });
    }
}
