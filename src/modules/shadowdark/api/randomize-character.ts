
import { NextResponse } from 'next/server';
import { ShadowdarkAdapter } from '../system';
import { logger } from '../../../core/logger';

// --- Logic Helpers ---

async function getRandomAncestry(client: any, systemData?: any) {
    if (!systemData) {
        const adapter = new ShadowdarkAdapter();
        systemData = await adapter.getSystemData(client);
    }
    const options = systemData.ancestries || [];
    if (!options.length) return null;
    const selection = options[Math.floor(Math.random() * options.length)];
    return await client.fetchByUuid(selection.uuid);
}

async function getRandomClass(client: any, systemData?: any) {
    if (!systemData) {
        const adapter = new ShadowdarkAdapter();
        systemData = await adapter.getSystemData(client);
    }
    const options = systemData.classes || [];
    if (!options.length) return null;
    const selection = options[Math.floor(Math.random() * options.length)];
    return await client.fetchByUuid(selection.uuid);
}

async function getRandomBackground(client: any, systemData?: any) {
    if (!systemData) {
        const adapter = new ShadowdarkAdapter();
        systemData = await adapter.getSystemData(client);
    }
    const options = systemData.backgrounds || [];
    if (!options.length) return null;
    const selection = options[Math.floor(Math.random() * options.length)];
    // Backgrounds are often simple items, but we fetch full doc to be safe/consistent
    return await client.fetchByUuid(selection.uuid);
}

async function getRandomDeity(client: any, systemData?: any) {
    if (!systemData) {
        const adapter = new ShadowdarkAdapter();
        systemData = await adapter.getSystemData(client);
    }
    const options = systemData.deities || [];
    if (!options.length) return null;
    const selection = options[Math.floor(Math.random() * options.length)];
    return await client.fetchByUuid(selection.uuid);
}

async function getRandomPatron(client: any, systemData?: any) {
    if (!systemData) {
        const adapter = new ShadowdarkAdapter();
        systemData = await adapter.getSystemData(client);
    }
    // Patrons might be in systemData or need ensuring.
    // Assuming they are in systemData.patrons (if added to adapter)
    // If not, we might need to search packs.
    // For now, return null if not found.
    const options = systemData.patrons || [];
    if (!options.length) return null;
    const selection = options[Math.floor(Math.random() * options.length)];
    return await client.fetchByUuid(selection.uuid);
}

function getRandomAlignment() {
    const alignments = ['Lawful', 'Neutral', 'Chaotic'];
    return alignments[Math.floor(Math.random() * alignments.length)];
}

function getRandomStats() {
    const roll3d6 = () => Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    const stats: any = {};
    ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(stat => {
        const val = roll3d6();
        stats[stat] = { value: val, mod: Math.floor((val - 10) / 2) };
    });
    return stats;
}

async function getRandomName(client: any, ancestryUuid?: string) {
    if (!ancestryUuid) return "Unnamed";

    try {
        const ancestry = await client.fetchByUuid(ancestryUuid);
        if (ancestry?.system?.nameTable) {
            const table = await client.fetchByUuid(ancestry.system.nameTable);
            if (table && table.results) {
                const results = table.results;
                const max = Math.max(...results.map((r: any) => (r.range?.[1] || 0)));
                if (max > 0) {
                    const roll = Math.floor(Math.random() * max) + 1;
                    const result = results.find((r: any) => roll >= (r.range?.[0] || 1) && roll <= (r.range?.[1] || 1));
                    return result?.text || result?.name || "Unnamed";
                }
            }
        }
        // Fallback if no table or fetch failed
        return ancestry?.name ? `${ancestry.name} Hero` : "Unnamed";
    } catch (e) {
        return "Unnamed";
    }
}

async function getRandomGear(client: any, level0: boolean) {
    if (!level0) return []; // Level 1 starts with gold/class kit logic, usually empty gear here.

    const gear: any[] = [];
    const GEAR_TABLE_UUID = "Compendium.shadowdark.rollable-tables.RollTable.EOr6HKQIQVuR35Ry";

    try {
        const table = await client.fetchByUuid(GEAR_TABLE_UUID);
        if (table && table.results) {
            const results = table.results;
            const max = Math.max(...results.map((r: any) => (r.range?.[1] || 0)));

            if (max > 0) {
                const count = Math.floor(Math.random() * 4) + 1;
                const selectedItems: any[] = [];
                const seenNames = new Set<string>();

                let attempts = 0;
                while (selectedItems.length < count && attempts < 50) {
                    attempts++;
                    const roll = Math.floor(Math.random() * max) + 1;
                    const result = results.find((r: any) => roll >= (r.range?.[0] || 1) && roll <= (r.range?.[1] || 1));

                    if (result && result.documentUuid) {
                        const name = result.text || result.name;
                        if (seenNames.has(name)) continue;

                        try {
                            const item = await client.fetchByUuid(result.documentUuid);
                            if (item) {
                                seenNames.add(name);

                                // Special Case: Shortbow and 5 arrows
                                if (item.name === "Shortbow and 5 arrows") {
                                    const arrowsUuid = "Compendium.shadowdark.gear.Item.XXwA9ZWajYEDmcea";
                                    const arrows = await client.fetchByUuid(arrowsUuid);
                                    if (arrows) {
                                        const fiveArrows = JSON.parse(JSON.stringify(arrows));
                                        if (!fiveArrows.system) fiveArrows.system = {};
                                        fiveArrows.system.quantity = 5;
                                        selectedItems.push(fiveArrows);
                                    }
                                    selectedItems.push(item);
                                } else {
                                    selectedItems.push(item);
                                }
                            }
                        } catch (e) {
                            logger.error(`Failed to fetch gear item ${result.documentUuid}: ${e}`);
                        }
                    }
                }

                // Post-Processing: Shortbow/Arrow Dependency
                const hasShortbow = selectedItems.some(i => i.name.toLowerCase().includes("shortbow"));
                const hasArrows = selectedItems.some(i => i.name.toLowerCase().includes("arrows"));

                if (hasShortbow && !hasArrows) {
                    const arrowsUuid = "Compendium.shadowdark.gear.Item.XXwA9ZWajYEDmcea";
                    const arrows = await client.fetchByUuid(arrowsUuid);
                    if (arrows) {
                        const fiveArrows = JSON.parse(JSON.stringify(arrows));
                        if (!fiveArrows.system) fiveArrows.system = {};
                        fiveArrows.system.quantity = 5;
                        selectedItems.push(fiveArrows);
                    }
                } else if (hasArrows && !hasShortbow) {
                    const shortbowResult = results.find((r: any) => r.text?.toLowerCase() === "shortbow" || r.name?.toLowerCase() === "shortbow");
                    if (shortbowResult && shortbowResult.documentUuid) {
                        const shortbow = await client.fetchByUuid(shortbowResult.documentUuid);
                        if (shortbow) selectedItems.push(shortbow);
                    }
                }
                gear.push(...selectedItems);
            }
        }
    } catch (e) {
        logger.error("Error randomizing gear", e);
    }
    return gear;
}

function getRandomTalents(ancestryDoc: any, classDoc?: any) {
    const results = { ancestry: [] as any[], class: [] as any[] };

    // Ancestry
    if (ancestryDoc?.system?.talents?.length) {
        const talents = ancestryDoc.system.talents;
        const choiceCount = ancestryDoc.system.talentChoiceCount || 0;

        if (choiceCount > 0 && talents.length > choiceCount) {
            const shuffled = [...talents].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, choiceCount);
            // Normalize to UUIDs
            results.ancestry = selected.map((t: any) => typeof t === 'string' ? t : t.uuid);
        }
    }

    return results;
}

async function getRandomLanguages(client: any, systemData: any, ancestryDoc: any, classDoc: any, intMod: number) {
    const known = new Set<string>();

    // 1. Fixed Languages
    const commonLang = systemData.languages.find((l: any) => l.name.trim().toLowerCase() === 'common');
    if (commonLang) known.add(commonLang.uuid);

    ancestryDoc?.system?.languages?.fixed?.forEach((u: string) => known.add(u));
    classDoc?.system?.languages?.fixed?.forEach((u: string) => known.add(u));

    const fixed = Array.from(known);

    // Helper to pick randomly from a pool based on rarity
    const pickFromPool = (count: number, rarity: string) => {
        const results: string[] = [];
        const pool = systemData.languages.filter((l: any) =>
            l.rarity === rarity && !known.has(l.uuid)
        );
        if (pool.length === 0) return results;

        const shuffled = [...pool].sort(() => 0.5 - Math.random());
        for (let i = 0; i < count && i < shuffled.length; i++) {
            const l = shuffled[i];
            results.push(l.uuid);
            known.add(l.uuid);
        }
        return results;
    };

    // 2. Aggregate counts and selections
    const selectedAncestry: string[] = [];
    const selectedClass: string[] = [];
    const selectedCommon: string[] = [];
    const selectedRare: string[] = [];

    // 2a. Ancestry
    const aLangs = ancestryDoc?.system?.languages || {};
    if (aLangs.select > 0 && aLangs.selectOptions?.length > 0) {
        const pool = aLangs.selectOptions.filter((u: string) => !known.has(u));
        const picked = pool.sort(() => 0.5 - Math.random()).slice(0, aLangs.select);
        picked.forEach((u: string) => {
            selectedAncestry.push(u);
            known.add(u);
        });
    }

    if (aLangs.common > 0) {
        selectedCommon.push(...pickFromPool(aLangs.common, 'common'));
    }
    if (aLangs.rare > 0) {
        selectedRare.push(...pickFromPool(aLangs.rare, 'rare'));
    }

    // 2b. Class (ONLY if level 1)
    const isLevel0 = !classDoc || classDoc.name === "Level 0";
    if (!isLevel0) {
        const cLangs = classDoc?.system?.languages || {};
        if (cLangs.select > 0 && cLangs.selectOptions?.length > 0) {
            const pool = cLangs.selectOptions.filter((u: string) => !known.has(u));
            const picked = pool.sort(() => 0.5 - Math.random()).slice(0, cLangs.select);
            picked.forEach((u: string) => {
                selectedClass.push(u);
                known.add(u);
            });
        }
        if (cLangs.common > 0) {
            selectedCommon.push(...pickFromPool(cLangs.common, 'common'));
        }
        if (cLangs.rare > 0) {
            selectedRare.push(...pickFromPool(cLangs.rare, 'rare'));
        }
    }

    // 2c. Int Mod Bonus
    let remaining = Math.max(0, intMod);
    if (remaining > 0) {
        const p = pickFromPool(remaining, 'common');
        selectedCommon.push(...p);
        remaining -= p.length;
    }
    if (remaining > 0) {
        const p = pickFromPool(remaining, 'rare');
        selectedRare.push(...p);
        remaining -= p.length;
    }

    return {
        fixed,
        known: Array.from(known),
        selected: {
            ancestry: selectedAncestry,
            class: selectedClass,
            common: selectedCommon,
            rare: selectedRare
        }
    };
}


// --- Route Handlers ---

export async function handleRandomizeName(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const body = await request.json().catch(() => ({}));
        const name = await getRandomName(client, body.ancestryUuid);
        return NextResponse.json({ name });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeAncestry(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const ancestry = await getRandomAncestry(client);
        return NextResponse.json({ ancestry });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeClass(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const cls = await getRandomClass(client);
        return NextResponse.json({ class: cls });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeBackground(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const bg = await getRandomBackground(client);
        return NextResponse.json({ background: bg });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeAlignment(request: Request) {
    try {
        const alignment = getRandomAlignment();
        return NextResponse.json({ alignment });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeDeity(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const deity = await getRandomDeity(client);
        return NextResponse.json({ deity });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizePatron(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const patron = await getRandomPatron(client);
        return NextResponse.json({ patron });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeStats(request: Request) {
    try {
        const stats = getRandomStats();
        return NextResponse.json({ stats });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeGear(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const body = await request.json().catch(() => ({}));
        const gear = await getRandomGear(client, body.level0 === true);
        return NextResponse.json({ gear });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeTalents(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const body = await request.json().catch(() => ({}));
        const ancestry = body.ancestryUuid ? await client.fetchByUuid(body.ancestryUuid) : null;
        const cls = body.classUuid ? await client.fetchByUuid(body.classUuid) : null;
        const talents = getRandomTalents(ancestry, cls);
        return NextResponse.json({ talents });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function handleRandomizeLanguages(request: Request) {
    try {
        const client = (request as any).foundryClient;
        const body = await request.json().catch(() => ({}));

        const adapter = new ShadowdarkAdapter();
        const systemData = await adapter.getSystemData(client);

        const ancestry = body.ancestryUuid ? await client.fetchByUuid(body.ancestryUuid) : null;
        const cls = body.classUuid ? await client.fetchByUuid(body.classUuid) : null;
        const intMod = body.intMod || 0;

        const languages = await getRandomLanguages(client, systemData, ancestry, cls, intMod);
        return NextResponse.json({ languages });
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}


// --- Main Aggregation Handler ---

export async function handleRandomizeCharacter(request: Request) {
    try {
        const client = (request as any).foundryClient;
        if (!client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const isLevel0 = body.level0 === true;

        const adapter = new ShadowdarkAdapter();
        const systemData = await adapter.getSystemData(client);

        if (!systemData.ancestries?.length || !systemData.classes?.length) {
            return NextResponse.json({ error: 'System data incomplete' }, { status: 500 });
        }

        // Parallel fetch for basic randoms
        const [ancestry, bg, deity, alignment, stats, gear] = await Promise.all([
            getRandomAncestry(client, systemData),
            getRandomBackground(client, systemData),
            getRandomDeity(client, systemData),
            Promise.resolve(getRandomAlignment()),
            Promise.resolve(getRandomStats()),
            getRandomGear(client, isLevel0)
        ]);

        // Class (Level 0 check)
        let cls = null;
        let patron = null;
        if (!isLevel0) {
            cls = await getRandomClass(client, systemData);
            // Warlock check? If class is warlock, maybe get patron? 
            // Logic in Generator.tsx handled this.
            // We can fetch patron if class name is "Warlock" or has feature?
            // For now, let's randomized patron if we have patron options. 
            // Or explicitly check class name.
            if (cls && cls.name.toLowerCase().includes('warlock')) {
                patron = await getRandomPatron(client, systemData);
            }
        }

        // Name (needs ancestry)
        const name = ancestry ? await getRandomName(client, ancestry.uuid) : "Unnamed";

        // Talents (needs ancestry + class)
        const talents = getRandomTalents(ancestry, cls);

        // Languages (needs ancestry + class + int mod)
        // We use the randomized stats INT mod
        const intMod = stats.INT?.mod || 0;
        const languages = await getRandomLanguages(client, systemData, ancestry, cls, intMod);

        const result = {
            name,
            ancestry,
            class: cls,
            background: bg,
            alignment,
            deity,
            patron,
            stats,
            gear,
            talents,
            languages,
            hp: isLevel0 ? Math.max(1, 1 + (stats.CON?.mod || 0)) : 0,
            gold: 0 // Removed per request
        };

        return NextResponse.json(result);

    } catch (e: any) {
        logger.error(`Randomize Character Error: ${e.message}`);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
