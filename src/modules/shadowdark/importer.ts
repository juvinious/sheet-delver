import { logger } from '../../core/logger';
import { FoundryClient } from '../../core/foundry';
import fs from 'fs';
import path from 'path';
import { findEffectUuid, SYSTEM_PREDEFINED_EFFECTS } from './data/talent-effects';
import { shadowdarkAdapter } from './system';
import { sanitizeItem, sanitizeItems, createEffect } from './utils/Sanitizer';

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
        const debugLog: string[] = [];
        const log = (msg: string) => {
            debugLog.push(msg);
            logger.info(`[ShadowdarkImporter] ${msg}`);
        };
        const trace = (msg: string) => {
            const timestamp = new Date().toISOString().split('T')[1].split('Z')[0];
            logger.debug(`[ShadowdarkImporter] [TRACE] [${timestamp}] ${msg}`);
        };
        const warnings: string[] = [];
        const errors: any[] = [];

        try {
            log(`[Importer] Starting Import (Server-Side). Name: ${json.name}`);
            
            await this.loadMapping();
            
            // Ensure connected
            // @ts-ignore
            if (!client.isConnected) {
                return { success: false, errors: ['Not connected to Foundry'] };
            }

            const gear: any[] = [];
            const spells: any[] = [];
            const talents: any[] = [];
            const classAbilities: any[] = [];

            // 1. Shallow Discovery (Fast Initial Handshake)
            log(`[Importer] Ensuring system data is discovered (Shallow)...`);
            const { ShadowdarkDiscovery } = await import('./discovery');
            const systemData = await ShadowdarkDiscovery.getSystemData(client);
            const { dataManager } = await import('./data/DataManager');

            // --- HELPER FUNCTIONS ---

            const findItem = async (itemName: string, type: string, silent: boolean = false) => {
                trace(`[findItem] START: '${itemName}' in '${type}'`);

                // 1. Check Index (Cache-First)
                const indexDoc = dataManager.findDocumentByName(itemName, type);
                
                // 2. Resolve/Hydrate by UUID (Always goes through DataManager for fulfillment)
                if (indexDoc) {
                    const uuid = indexDoc.uuid || indexDoc._id;
                    trace(`[findItem] Found in index: ${uuid}. Hydrating...`);
                    const fullDoc = await dataManager.getDocument(uuid, client);
                    trace(`[findItem] Hydration complete for: ${uuid}`);
                    if (fullDoc) return sanitizeItem(fullDoc);
                }

                // 3. Check mapping fallback
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
                    log(`[findItem] Found in mapping: ${itemUuid}. Fetching...`);
                    const item = await dataManager.getDocument(itemUuid, client);
                    trace(`[findItem] Mapping fetch complete: ${itemUuid}`);
                    if (item) return sanitizeItem(item);
                    log(`[findItem] WARN: Mapping UUID ${itemUuid} could not be resolved`);
                }

                // 4. Fallback: parentheses cleanup
                const cleanName = itemName.replace(/\s*\(.*?\)\s*/g, '').trim();
                if (cleanName && cleanName !== itemName) {
                    log(`[findItem] Trying fallback search with: '${cleanName}'`);
                    return findItem(cleanName, type, true);
                }

                if (!silent) {
                    log(`[findItem] FAILED to find '${itemName}'`);
                    errors.push({ type, name: itemName, error: 'Not found' });
                }
                return null;
            };

            const findSpell = async (spellData: any, classList: any[]) => {
                trace(`[findSpell] START: '${spellData.bonusName}' (Source: ${spellData.sourceName})`);

                // Use DataManager's efficient spell source lookup
                const classObj = classList.find(c => c.name.toLowerCase() === spellData.sourceName.toLowerCase());
                if (classObj) {
                    const spellsInSource = await dataManager.getSpellsBySource(classObj.name);
                    const match = spellsInSource.find(s => s.name?.toLowerCase() === spellData.bonusName?.toLowerCase());
                    if (match) {
                        log(`[findSpell] Found verified spell: ${match.name}`);
                        // Fulfillment
                        const fullDoc = await dataManager.getDocument(match.uuid || match._id, client);
                        trace(`[findSpell] Fulfillment complete for spell: ${match.name}`);
                        return sanitizeItem(fullDoc || match);
                    }
                }

                // Fallback: Loose Search (Name only)
                log(`[findSpell] Strict lookup failed for '${spellData.bonusName}', trying loose cache search...`);
                return findItem(spellData.bonusName, 'Spell');
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
                    foundTalent = await shadowdarkAdapter.resolveDocument(client, uuid);
                }

                if (!foundTalent) {
                    const uuid = findEffectUuid(bonus.bonusName || bonus.name);
                    if (uuid) {
                        log(`[findTalent] Found match in TALENT_EFFECTS_MAP: ${uuid}`);
                        foundTalent = await shadowdarkAdapter.resolveDocument(client, uuid);
                    }
                }

                if (!foundTalent) {
                    let searchName = bonus.bonusName || bonus.name;
                    
                    // Special Handling: Kobold Knacks
                    if (bonus.name === 'Knack' && bonus.bonusName === 'LuckTokenAtStartOfSession') {
                        searchName = 'Knack (Luck)';
                    }

                    log(`[findTalent] Mapping failed, trying dynamic search for '${searchName}' (Type: Talent/Feature)...`);
                    foundTalent = await findItem(searchName, 'Talent', true) || await findItem(searchName, 'Feature', true);

                    // Spellcasting Special Handling: Wizard / Priest / Seer / Witch
                    if (!foundTalent && searchName.includes('Spellcasting')) {
                        const classMatch = searchName.split(' ')[0]; // e.g. "Wizard" from "Wizard Spellcasting"
                        const lookup = `${classMatch} Spellcasting`;
                        const uuid = findEffectUuid(lookup);
                        if (uuid) {
                            log(`[findTalent] Resolved specific spellcasting: ${lookup}`);
                            foundTalent = await shadowdarkAdapter.resolveDocument(client, uuid);
                        }
                    }

                    // Warlock/Boon Fallback: Try searching in Spells
                    if (!foundTalent && (bonus.sourceCategory === 'Boon' || bonus.sourceCategory === 'Patron')) {
                        log(`[findTalent] Boon/Patron search fallback to Spells for '${searchName}'...`);
                        foundTalent = await findItem(searchName, 'Spell', true);
                    }

                    // Final Fallback: try bonus.name if it differs from bonusName
                    if (!foundTalent && bonus.name !== searchName) {
                        log(`[findTalent] Final fallback search for '${bonus.name}'...`);
                        foundTalent = await findItem(bonus.name, 'Talent', true) || await findItem(bonus.name, 'Feature', true);
                    }
                }

                if (foundTalent) {
                    const isBoon = bonus.sourceCategory === 'Boon' || bonus.sourceCategory === 'Patron' || bonus.name === 'LearnSpellFromPatron';
                    const isSpell = foundTalent.type === 'Spell';

                    // Boon Wrapping Logic: If we resolved a Boon to a Spell, wrap it in a Talent
                    if (isBoon && isSpell) {
                        log(`[findTalent] Wrapping Boon Spell '${foundTalent.name}' as a Talent...`);
                        
                        const spellDoc = sanitizeItem(foundTalent);
                        // Ensure spell isn't already in library
                        if (!spells.find(s => s.name?.toLowerCase() === spellDoc.name?.toLowerCase())) {
                            spells.push(spellDoc);
                        }

                        // Create the Boon Talent
                        foundTalent = {
                            name: `Boon: ${spellDoc.name}`,
                            type: 'Talent',
                            img: spellDoc.img || 'icons/magic/symbols/rune-glitter-blue.webp',
                            system: {
                                description: `<p><strong>Boon of the Patron:</strong> You have gained the spell <em>${spellDoc.name}</em> from your patron (${bonus.boonPatron || "Unknown"}).</p>${spellDoc.system?.description || ""}`,
                                talentClass: 'class',
                                level: bonus.gainedAtLevel
                            }
                        };
                    } else {
                        foundTalent = sanitizeItem(foundTalent);
                    }

                    if (foundTalent.system?.talentClass === "level") foundTalent.system.level = bonus.gainedAtLevel;

                    // Apply Predefined System Effects (Automation) 
                    const predefinedKey = bonus.bonusName || bonus.name;
                    const predef = SYSTEM_PREDEFINED_EFFECTS[predefinedKey];
                    if (predef) {
                        log(`[findTalent] Applying predefined effect for '${predefinedKey}'...`);
                        foundTalent.img = predef.icon || foundTalent.img;
                        
                        const changes = predef.changes || (predef.key ? [{ key: predef.key, mode: predef.mode || 2, value: predef.value }] : []);
                        
                        if (changes.length > 0) {
                            // Resolve "REPLACEME" in changes if needed
                            const resolvedChanges = changes.map(c => ({
                                ...c,
                                value: String(c.value).replace("REPLACEME", bonus.bonusTo || "")
                            }));

                            // Add to talent's effects
                            const effect = createEffect(predef.label, predef.icon, resolvedChanges, { 
                                sourceName: "Shadowdarkling Import",
                                flags: { shadowdarkling: { category: bonus.sourceCategory, name: predefinedKey } }
                            });
                            
                            foundTalent.effects = foundTalent.effects || [];
                            foundTalent.effects.push(effect);
                        }
                    }

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

                    if (bonus.sourceCategory === "Boon" && !foundTalent.name.includes("[")) foundTalent.name += ` [${bonus.boonPatron}]`;
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

                const collections = ['items', 'spells', 'talents'];
                for (const key of collections) {
                    const match = systemData[key]?.find((i: any) =>
                        i.name.toLowerCase().includes(keyword.toLowerCase()) &&
                        (!type || (i.type || i.documentType || "").toLowerCase() === type.toLowerCase())
                    );
                    if (match && match.img) return match.img;
                }
                return null;
            };

            const getClassList = async () => {
                return systemData.classes || [];
            };


            // --- MAIN LOGIC ---

            // 2. Prepare Actor Data
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
                    languages: [] 
                }
            };

            // Calculate Mods
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
                const base = actorData.system.abilities[k].base;
                actorData.system.abilities[k].mod = Math.floor((base - 10) / 2);
            });

            // 3. Parallel Core Resolution
            log(`[Importer] Resolving Core Attributes (Ancestry, Background, Deity, Patron)...`);
            const coreResolvers = [
                findItem(json.ancestry, "Ancestry"),
                findItem(json.background, "Background"),
                findItem(json.deity, "Deity"),
                (async () => {
                    let patronName = json.patron;
                    if (!patronName && json.bonuses) {
                        const patronBonus = json.bonuses.find((b: any) => b.sourceCategory === 'Patron' && b.name === 'Patron');
                        if (patronBonus) patronName = patronBonus.bonusTo;
                    }
                    return patronName ? findItem(patronName, "Patron") : null;
                })()
            ];

            const [ancestry, background, deity, patron] = await Promise.all(coreResolvers);

            if (ancestry) actorData.system.ancestry = ancestry.uuid || `Item.${ancestry._id}`;
            if (background) actorData.system.background = background.uuid || `Item.${background._id}`;
            if (deity) actorData.system.deity = deity.uuid || `Item.${deity._id}`;
            if (patron) actorData.system.patron = patron.uuid || `Item.${patron._id}`;

            // Languages
            if (json.languages) {
                log(`[Importer] Resolving ${json.languages.split(',').length} languages in parallel...`);
                const langPromises = json.languages.split(/\s*,\s*/).map((lang: string) => findItem(lang, "Language"));
                const resolvedLangs = await Promise.all(langPromises);
                actorData.system.languages = resolvedLangs.filter(Boolean).map(l => l.uuid || `Item.${l._id}`);
            }

            // Class & Static Items
            const classList = await getClassList();
            const classObj = await findItem(json.class, "Class");
            if (classObj) {
                actorData.system.class = classObj.uuid || `Item.${classObj._id}`;

                // Starting Spells (Fixed)
                if (classObj.system?.startingSpells) {
                    const startSpells = await Promise.all(classObj.system.startingSpells.map((uuid: string) => shadowdarkAdapter.resolveDocument(client, uuid)));
                    spells.push(...startSpells.filter(Boolean).map(sanitizeItem));
                }

                // Fixed Class Talents
                if (classObj.system?.talents) {
                    log(`[Importer] Hydrating ${classObj.system.talents.length} class-defined talents...`);
                    const fixedTalents = await Promise.all(classObj.system.talents.map((uuid: string) => shadowdarkAdapter.resolveDocument(client, uuid)));
                    for (const item of fixedTalents.filter(Boolean)) {
                        const obj = sanitizeItem(item);
                        const existing = talents.find(t => t.name.toLowerCase() === obj.name.toLowerCase());
                        if (!existing) {
                            trace(`[Importer] Adding class talent: ${obj.name}`);
                            talents.push(obj);
                        } else {
                            trace(`[Importer] Class talent already present (skipping duplicate): ${obj.name}`);
                        }
                    }
                }
            }

            // 4. Parallel Gear Resolution
            if (json.gear) {
                log(`[Importer] Resolving ${json.gear.length} gear items in parallel...`);
                const gearPromises = json.gear.map(async (g: any) => {
                    const type = g.type === 'sundry' ? 'basic' : g.type;
                    if (g.name === "Coins") return null;

                    const item = await findItem(g.name, type);
                    if (item) {
                        const itemData = sanitizeItem(item);
                        if (itemData.system) itemData.system.quantity = g.quantity;
                        return itemData;
                    } else {
                        // Custom Handlers
                        if (type === 'basic' || type === 'sundry' || g.type === 'sundry') {
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

                            return {
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
                            };
                        }
                        return null;
                    }
                });
                const resolvedGear = await Promise.all(gearPromises);
                gear.push(...resolvedGear.filter(Boolean));
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

            // 5. Parallel Magic Item Resolution
            if (json.magicItems) {
                log(`[Importer] Resolving ${json.magicItems.length} magic items in parallel...`);
                const magicPromises = json.magicItems.map(async (m: any) => {
                    let type = 'basic';
                    if (m.magicItemType === 'magicWeapon') type = 'weapon';
                    else if (m.magicItemType === 'magicArmor') type = 'armor';

                    let item = await findItem(m.name, type, true);
                    if (!item) {
                        const baseName = m.name.replace(/\s*\+\d+/, '').trim();
                        if (baseName !== m.name) {
                            item = await findItem(baseName, type, true);
                        }
                    }

                    if (item) {
                        const itemData = sanitizeItem(item);
                        itemData.name = m.name;
                        if (itemData.system) {
                            if (m.bonus) {
                                if (type === 'weapon') itemData.system.bonus = { ...itemData.system.bonus, attack: m.bonus, damage: m.bonus };
                                if (type === 'armor') itemData.system.ac = { ...itemData.system.ac, value: (itemData.system.ac?.value || 0) + m.bonus };
                            }
                            if (m.slots) itemData.system.slots.slots_used = m.slots;
                        }
                        return itemData;
                    } else {
                        // Custom Handlers
                        if (type === 'basic' || type === 'sundry' || m.itemType === 'sundry') {
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

                            return {
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
                            };
                        }
                        return null;
                    }
                });
                const resolvedMagic = await Promise.all(magicPromises);
                gear.push(...resolvedMagic.filter(Boolean));
            }


            // 6. Chunked Bonuses Resolution
            if (json.bonuses && json.bonuses.length > 0) {
                log(`[Importer] Resolving ${json.bonuses.length} dynamic bonuses in chunks...`);
                const CHUNK_SIZE = 5; // Small chunks for maximum stability
                const bonuses = json.bonuses;

                for (let i = 0; i < bonuses.length; i += CHUNK_SIZE) {
                    const chunk = bonuses.slice(i, i + CHUNK_SIZE);
                    trace(`[Importer] Processing bonus chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(bonuses.length / CHUNK_SIZE)}`);
                    
                    await Promise.all(chunk.map(async (bonus: any) => {
                        if (/^ExtraLanguage:/.test(bonus.name)) return null;
                        if (/^ExtraLanguageManual:/.test(bonus.name)) return null;
                        if (/^GrantSpecialTalent:/.test(bonus.name)) return null;
                        if (bonus.sourceCategory === 'Patron' && bonus.name === 'Patron') {
                            trace(`[Importer] Skipping redundant Patron bonus: ${bonus.bonusTo}`);
                            return null;
                        }
                        if (this.mapping.ignoreTalents?.includes(bonus.name)) {
                            trace(`[Importer] Ignoring talent per mapping: ${bonus.name}`);
                            return null;
                        }

                        if (bonus.name === "SetWeaponTypeDamage") bonus.bonusTo = bonus.bonusTo.split(":")[0];

                        if (/^Spell:/.test(bonus.name)) {
                            const spell = await findSpell(bonus, classList);
                            if (spell) {
                                trace(`[Importer] Resolved spell: ${spell.name}`);
                                spells.push(spell);
                            }
                            return null;
                        }

                        const talent = await findTalent(bonus);
                        if (talent) {
                            trace(`[Importer] Resolved talent: ${talent.name}`);
                            talents.push(talent);
                        }
                        return null;
                    }));
                }
            }

            // 7. Create Actor and Items
            log(`[Importer] Creating Actor ${actorData.name}...`);
            const createdActor = await client.createActor(actorData);
            if (!createdActor) throw new Error("Failed to create Actor document");

            log(`[Importer] Actor Created: ${createdActor._id}`);

            const allItems = sanitizeItems([...gear, ...classAbilities, ...spells, ...talents]).filter(i => i.type !== 'Class');

            if (allItems.length > 0) {
                log(`[Importer] Creating ${allItems.length} embedded items in parallel chunks...`);
                await client.createActorItem(createdActor._id, allItems);
            }

            log(`[Importer] Import Successful: ${createdActor._id}`);
            return { success: true, id: createdActor._id, errors: errors.length > 0 ? errors : undefined, warnings: warnings.length > 0 ? warnings : undefined, debug: debugLog };

        } catch (e: any) {
            log(`[Importer] CRITICAL ERROR: ${e.message}`);
            logger.error('[ShadowdarkImporter] Critical Import Failure:', e);
            return { success: false, errors: [e.message, e.stack], warnings: warnings, debug: debugLog };
        }
    }
}
