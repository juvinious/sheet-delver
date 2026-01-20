'use client';

import { useState, useEffect } from 'react';
import { Crimson_Pro, Inter } from 'next/font/google';

const crimson = Crimson_Pro({ subsets: ['latin'], variable: '--font-crimson' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function Generator() {
    const [loading, setLoading] = useState(true);

    const [systemData, setSystemData] = useState<any>(null);
    const [ancestryDetails, setAncestryDetails] = useState<any>(null);
    const [classDetails, setClassDetails] = useState<any>(null);
    const [patronDetails, setPatronDetails] = useState<any>(null);
    const [showPatronModal, setShowPatronModal] = useState(false);

    // Ancestry Choice State
    const [showAncestryTalentsModal, setShowAncestryTalentsModal] = useState(false);
    const [selectedAncestryTalents, setSelectedAncestryTalents] = useState<string[]>([]);


    const [formData, setFormData] = useState({
        level0: true,
        ancestry: '',
        class: '',
        background: '',
        alignment: 'neutral',
        deity: '',
        patron: '',
        name: '',
        description: '',
        stats: {
            STR: { value: 10, mod: 0 },
            DEX: { value: 10, mod: 0 },
            CON: { value: 10, mod: 0 },
            INT: { value: 10, mod: 0 },
            WIS: { value: 10, mod: 0 },
            CHA: { value: 10, mod: 0 }
        },
        hp: 0,
        gold: 0
    });

    // Helper: Calculate Modifier
    const getMod = (score: number) => Math.floor((score - 10) / 2);

    // Helper: Fetch Foundry Document
    const fetchDocument = async (uuid: string) => {
        try {
            const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(uuid)}`);
            if (!res.ok) throw new Error('Failed to fetch document');
            return await res.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    // Verify Connection on Mount
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const res = await fetch('/api/session/connect');
                const data = await res.json();

                // If not connected, system mismatch, or NOT LOGGED IN, redirect to home.
                if (!data.connected || (data.system && data.system.id !== 'shadowdark') || data.system?.id === 'setup' || !data.system?.isLoggedIn) {
                    window.location.href = '/';
                }
            } catch {
                window.location.href = '/';
            }
        };
        checkConnection();
    }, []);

    // Load System Data
    useEffect(() => {
        fetch('/api/system/data')
            .then(res => res.json())
            .then(data => {
                setSystemData(data);
                console.log("[Generator] System Data Loaded:", data);
                setLoading(false);
            })
            .catch(err => console.error('Failed to load system data', err));
    }, []);



    // Fetch Class Details on change
    useEffect(() => {
        setClassDetails(null); // Clear previous class immediately
        if (!formData.class) {
            return;
        }
        fetchDocument(formData.class).then(data => setClassDetails(data));
    }, [formData.class]);

    // Fetch Patron Details on change
    useEffect(() => {
        if (!formData.patron) {
            setPatronDetails(null);
            return;
        }
        fetchDocument(formData.patron).then(data => setPatronDetails(data));
    }, [formData.patron]);

    // Roll Stats (3d6 down the line)
    const rollStats = () => {
        const roll3d6 = () => Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 3;

        const newStats: any = {};
        ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].forEach(stat => {
            const val = roll3d6();
            newStats[stat] = { value: val, mod: getMod(val) };
        });

        setFormData(prev => ({ ...prev, stats: newStats }));
    };

    // Calculate HP based on Level Rules
    const calculateHP = () => {
        let hp = 1;

        if (formData.level0) {
            // Level 0: 1 + CON mod (min 1)
            hp = Math.max(1, 1 + formData.stats.CON.mod);
        } else {
            // Level 1: Hit Die + CON mod
            let hitDie = "d4";
            if (classDetails?.system?.hitPoints) {
                hitDie = classDetails.system.hitPoints;
            }

            // Parse "d8" -> 8
            const sides = parseInt(hitDie.replace("d", "")) || 4;
            const roll = Math.floor(Math.random() * sides) + 1;

            // Add CON mod, minimum 1 HP total
            hp = Math.max(1, roll + formData.stats.CON.mod);
        }

        setFormData(prev => ({ ...prev, hp }));
    };

    // Calculate Gold: 2d6 * 5 or 0 for Level 0
    const calculateGold = () => {
        if (formData.level0) {
            setFormData(prev => ({ ...prev, gold: 0 }));
            return;
        }
        const d6 = () => Math.floor(Math.random() * 6) + 1;
        const gold = (d6() + d6()) * 5;
        setFormData(prev => ({ ...prev, gold }));
    };

    // Randomize Gear (Level 0)
    const randomizeGear = async () => {
        const GEAR_TABLE_UUID = "Compendium.shadowdark.rollable-tables.RollTable.EOr6HKQIQVuR35Ry";

        // Count Logic: Roll 1d4 to determine how many times to draw
        const count = Math.floor(Math.random() * 4) + 1;

        const gearTable = await fetchDocument(GEAR_TABLE_UUID);
        if (!gearTable || !gearTable.results) return;

        let max = 0;
        gearTable.results.forEach((r: any) => {
            if (r.range[1] > max) max = r.range[1];
        });

        const selectedItems: any[] = [];
        const seenNames = new Set<string>();

        // Loop until we have enough items
        let attempts = 0;
        while (selectedItems.length < count && attempts < 50) {
            attempts++;
            const roll = Math.floor(Math.random() * max) + 1;
            const result = gearTable.results.find((r: any) => roll >= r.range[0] && roll <= r.range[1]);

            if (result && result.documentUuid) {
                // Enforce NO DUPLICATES
                if (seenNames.has(result.text || result.name)) continue;

                const item = await fetchDocument(result.documentUuid);
                if (item) {
                    seenNames.add(result.text || result.name); // Mark as seen

                    // Special case: Shortbow and 5 arrows (Legacy Item)
                    if (item.name === "Shortbow and 5 arrows") {
                        const arrows = await fetchDocument("Compendium.shadowdark.gear.Item.XXwA9ZWajYEDmcea");
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
            }
        }

        // Post-Processing: Shortbow/Arrow Dependency
        // Verify if we have a Shortbow but no Arrows, or Arrows but no Shortbow.
        // We check for names including "Shortbow" or "Arrows".
        const hasShortbow = selectedItems.some(i => i.name.toLowerCase().includes("shortbow"));
        const hasArrows = selectedItems.some(i => i.name.toLowerCase().includes("arrows"));

        if (hasShortbow && !hasArrows) {
            const arrows = await fetchDocument("Compendium.shadowdark.gear.Item.XXwA9ZWajYEDmcea");
            if (arrows) {
                const fiveArrows = JSON.parse(JSON.stringify(arrows));
                if (!fiveArrows.system) fiveArrows.system = {};
                fiveArrows.system.quantity = 5;
                selectedItems.push(fiveArrows);
            }
        } else if (hasArrows && !hasShortbow) {
            // Need to find Shortbow UUID.
            // Assuming it's in the table, or we can look it up.
            // If we can't find it easily, we might skip or try to fetch from pack if we knew UUID.
            // Let's assume the user considers Shortbow + Arrows a set.
            // We can search the gear table results for "Shortbow"?
            // Or use a hardcodded UUID if we knew it.
            // For now, let's rely on the table containing it or the user accepting arrow-only (rare).
            // BUT user said "or vice versa".
            // Let's check table results for "Shortbow".
            const shortbowResult = gearTable.results.find((r: any) => r.text?.toLowerCase() === "shortbow" || r.name?.toLowerCase() === "shortbow");
            if (shortbowResult && shortbowResult.documentUuid) {
                const shortbow = await fetchDocument(shortbowResult.documentUuid);
                if (shortbow) selectedItems.push(shortbow);
            }
        }

        setGearSelected(selectedItems);
    };

    // Effect 1: Hit Points & Gold (Stats changes)
    useEffect(() => {
        calculateHP();
        // Gold is random, don't re-roll on stats change.
        // But do we want to re-roll Gold on Level toggle?
        // calculateGold is called by randomizeAll.
        // We should just init gold on mount? Or on Level Toggle?
        if (formData.level0) {
            // If switching to Level 0, ensure Gold is 0.
            // But we don't want to infinite loop if we setFormData here.
            // Actually calculateGold checks level0 and sets 0
            // But doing this in effect might loop if gold isn't stable.
            // Just let `level0` change trigger it once.
            setFormData(prev => ({ ...prev, gold: 0 }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.stats.CON.mod]); // Only CON mod? Class is handled by level change.

    // Effect 2: Gear & Gold (Level/Class changes)
    useEffect(() => {
        // If Class changes (and not level 0), maybe re-calc HP?
        calculateHP();

        // If Level 0 toggled
        if (formData.level0) {
            randomizeGear();
            setFormData(prev => ({ ...prev, gold: 0 }));
        } else {
            setGearSelected([]);
            // If switching to Level 1, maybe roll gold?
            // Only if gold is 0?
            // calculateGold(); // Randomizes.
            // User might want to keep rolled gold.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classDetails, formData.level0]);

    // Helper: Random Text from Roll Table
    const randomNameFromTable = async (tableUuid: string) => {
        if (!tableUuid) return "";
        try {
            const table = await fetchDocument(tableUuid);
            console.log("[Generator] Name Table Fetched:", tableUuid, table);

            if (!table?.results) return "";

            // Handle both Array and Collection-like object (Foundry toJSON sometimes varies)
            const resultsArray = Array.isArray(table.results) ? table.results : Object.values(table.results);

            if (!resultsArray.length) return "";

            // Simple random pick from results
            const result = resultsArray[Math.floor(Math.random() * resultsArray.length)];
            return result.text || result.name || "Unnamed";
        } catch (e) {
            console.warn("Failed to fetch name table", e);
            return "";
        }
    };

    // Randomize Name
    // Fallback Names (minimal list to prevent "Unnamed")
    const FALLBACK_NAMES: Record<string, string[]> = {
        'Dwarf': ['Hilda', 'Torin', 'Balin', 'Dwalin', 'Kili', 'Fili', 'Gloin', 'Oin', 'Nori', 'Ori'],
        'Elf': ['Legolas', 'Thranduil', 'Galadriel', 'Elrond', 'Arwen', 'Tauriel', 'Haldir', 'Celeborn'],
        'Halfling': ['Frodo', 'Sam', 'Merry', 'Pippin', 'Bilbo', 'Lobelia', 'Rosie', 'Gollum'],
        'Goblin': ['Glar', 'Snikt', 'Bog', 'Zog', 'Krug', 'Rash', 'Mok', 'Nok'],
        'Human': ['Aragorn', 'Boromir', 'Eowyn', 'Faramir', 'Theodred', 'Eomer', 'Gandalf', 'Saruman'],
        'Half-Orc': ['Grom', 'Thark', 'Mog', 'Varg', 'Karg', 'Urak', 'Grish', 'Naz'],
        'default': ['Hero', 'Adventurer', 'Wanderer', 'Traveler']
    };



    const randomizeName = async (ancestryUuid: string) => {
        if (!ancestryUuid) return;
        try {
            const ancestry = await fetchDocument(ancestryUuid);
            let name = "";

            if (ancestry?.system?.nameTable) {
                name = await randomNameFromTable(ancestry.system.nameTable);
            }

            if (!name) {
                // Fallback
                const type = ancestry?.name || 'default';
                const list = FALLBACK_NAMES[type] || FALLBACK_NAMES['default'];
                name = list[Math.floor(Math.random() * list.length)];
            }

            setFormData(prev => ({ ...prev, name }));
        } catch (e) {
            console.error("Name randomization failed", e);
            setFormData(prev => ({ ...prev, name: "Unnamed Hero" }));
        }
    };

    // Randomize All
    const randomizeAll = async () => {
        if (!systemData) return;

        // Safety check
        if (!systemData.ancestries?.length || !systemData.backgrounds?.length || !systemData.classes?.length) {
            console.warn("System data is incomplete or loading", systemData);
            return;
        }

        setLoading(true); // Brief loading state for better UX

        const rand = (arr: any[]) => (arr && arr.length > 0) ? arr[Math.floor(Math.random() * arr.length)] : null;

        // 1. Pick Core Options
        const anc = rand(systemData.ancestries);
        const bg = rand(systemData.backgrounds);
        const cls = !formData.level0 ? rand(systemData.classes) : null;
        const deity = rand(systemData.deities);

        const newAncestry = anc?.uuid || '';
        const newBackground = bg?.uuid || '';
        // Only pick class if NOT level 0 (or if user wants to pre-select for L1)
        const newClass = !formData.level0 ? (cls?.uuid || '') : '';
        const newAlignment = rand(['lawful', 'neutral', 'chaotic']);
        const newDeity = deity?.uuid || '';

        let newPatron = '';
        if (cls && cls.uuid) {

            // We need to check if class requires patron. The systemData summary might not have it.
            // We might need to fetch the class doc, but we can't await inside this sync block easily for logic check.
            // However, we know Warlock usually needs it.
            // Let's assume if systemData.patrons exists and we picked a class, we *might* want one?
            // Actually, `classDetails` updates async. `randomizeAll` updates `formData`.
            // Ideally we check `systemData.classes` if it has extra metadata, but `ShadowdarkAdapter` only provides basic info.
            // Workaround: If we pick a class, we can try to find if it's Warlock by name? Or just pick a random patron if available,
            // and if the class doesn't need it, it just ignores it.
            const isWarlock = cls.name?.toLowerCase().includes('warlock');
            if (isWarlock && systemData.patrons?.length > 0) {
                // @ts-ignore
                newPatron = rand(systemData.patrons).uuid;
            }
        }

        // 2. Roll Stats
        rollStats();

        // 3. Roll Gold
        calculateGold();

        // 4. Update State (Base)
        setFormData(prev => ({
            ...prev,
            ancestry: newAncestry,
            background: newBackground,
            class: newClass,
            alignment: newAlignment,
            deity: newDeity,
            patron: newPatron,
        }));

        if (newAncestry) {
            await randomizeName(newAncestry);
        }

        // 6. Gold & Gear
        calculateGold();
        if (formData.level0) {
            await randomizeGear();
        } else {
            setGearSelected([]);
        }

        setLoading(false);
    };

    // Effect: React to Level Toggle
    useEffect(() => {
        // If switching TO Level 1 and no class selected, maybe pick one? 
        // Or just let user pick. For now, we ensure validation.
        if (!formData.level0 && !formData.class && systemData?.classes) {
            // Optional: Auto-pick class if none? User didn't explicitly ask, but it's helpful.
            // Let's leave it blank to force choice, OR pick random if they hit random.
        }
        // If switching TO Level 0, clear class?
        if (formData.level0 && formData.class) {
            setFormData(prev => ({ ...prev, class: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.level0, systemData]);

    // Effect: Load Ancestry Details & Talents
    useEffect(() => {
        // Always reset selections when ancestry changes
        setSelectedAncestryTalents([]);
        setKnownLanguages(prev => ({ ...prev, fixed: [], selected: [] })); // Reset languages

        if (!formData.ancestry) {
            setAncestryDetails(null);
            setAncestryTalents({ fixed: [], choice: [], choiceCount: 0 });
            return;
        }

        const loadAncestry = async () => {
            try {
                const details = await fetchDocument(formData.ancestry);
                setAncestryDetails(details);

                // Load Fixed Languages from Ancestry
                if (details.system.languages?.fixed?.length > 0) {
                    const langDocs = await Promise.all(details.system.languages.fixed.map((u: string) => fetchDocument(u)));
                    const resolvedLangs = langDocs.map((d, i) => d ? {
                        uuid: details.system.languages.fixed[i],
                        name: d.name
                    } : null).filter(d => d);
                    setKnownLanguages(prev => ({ ...prev, fixed: resolvedLangs }));
                }

                if (!details?.system) return;

                const fixed: any[] = [];
                const choice: any[] = [];
                const choiceCount = details.system.talentChoiceCount || 0;

                if (details.system.talents?.length > 0) {
                    const docs = await Promise.all(details.system.talents.map((u: string) => fetchDocument(u)));
                    const loaded = docs.map((d, i) => d ? {
                        uuid: details.system.talents[i],
                        name: d.name,
                        description: (d.system?.description?.value || d.system?.description || "").replace(/<[^>]+>/g, ' ')
                    } : null).filter(d => d);

                    // Logic: If available talents <= choice count, they are all fixed (you get all of them).
                    // Otherwise, they are choices.
                    if (loaded.length <= choiceCount) {
                        fixed.push(...loaded);
                    } else {
                        choice.push(...loaded);
                    }
                }

                setAncestryTalents({ fixed, choice, choiceCount });

            } catch (e) {
                console.error("Ancestry load error", e);
            }
        };
        loadAncestry();
    }, [formData.ancestry]);

    const [classTalents, setClassTalents] = useState<{ fixed: any[], choice: any[], choiceCount: number, table?: boolean }>({ fixed: [], choice: [], choiceCount: 0 });
    const [ancestryTalents, setAncestryTalents] = useState<{ fixed: any[], choice: any[], choiceCount: number }>({ fixed: [], choice: [], choiceCount: 0 });

    // Gear State
    const [gearSelected, setGearSelected] = useState<any[]>([]);

    // Language State
    const [knownLanguages, setKnownLanguages] = useState<{ fixed: any[], selected: string[] }>({ fixed: [], selected: [] });
    const [languageConfig, setLanguageConfig] = useState<{ common: number, rare: number, fixed: string[] }>({ common: 0, rare: 0, fixed: [] });
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [weaponNames, setWeaponNames] = useState<string[]>([]);
    const [armorNames, setArmorNames] = useState<string[]>([]);

    useEffect(() => {
        if (!classDetails?.system || formData.level0) {
            setClassTalents({ fixed: [], choice: [], choiceCount: 0 });
            setWeaponNames([]);
            setArmorNames([]);
            setLanguageConfig({ common: 0, rare: 0, fixed: [] });
            setKnownLanguages(prev => ({ ...prev, selected: [] }));
            return;
        }

        const loadDetails = async () => {
            // Configure Languages from Class
            if (classDetails.system.languages) {
                setLanguageConfig({
                    common: classDetails.system.languages.common || 0,
                    rare: classDetails.system.languages.rare || 0,
                    fixed: classDetails.system.languages.fixed || []
                });
            } else {
                setLanguageConfig({ common: 0, rare: 0, fixed: [] });
            }

            // 1. Talents
            const fixed: any[] = [];
            const choice: any[] = [];
            const choiceCount = classDetails.system.talentChoiceCount || 0;
            const table = classDetails.system.classTalentTable || false;

            // Fixed Talents
            if (classDetails.system.talents?.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.talents.map((u: string) => fetchDocument(u)));
                    fixed.push(...docs.map((d, i) => d ? {
                        uuid: classDetails.system.talents[i],
                        name: d.name,
                        description: (d.system?.description?.value || d.system?.description || "").replace(/<[^>]+>/g, ' ')
                    } : null).filter(d => d));
                } catch (e) {
                    console.error("Talent load error", e);
                }
            }

            // Choice Talents
            if (classDetails.system.talentChoices?.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.talentChoices.map((u: string) => fetchDocument(u)));
                    choice.push(...docs.map((d, i) => d ? {
                        uuid: classDetails.system.talentChoices[i],
                        name: d.name,
                        description: (d.system?.description?.value || d.system?.description || "").replace(/<[^>]+>/g, ' ')
                    } : null).filter(d => d));
                } catch (e) {
                    console.error("Talent choice load error", e);
                }
            }

            setClassTalents({ fixed, choice, choiceCount, table });

            // 2. Weapons
            if (Array.isArray(classDetails.system.weapons) && classDetails.system.weapons.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.weapons.map((u: string) => fetchDocument(u)));
                    setWeaponNames(docs.filter(d => d && d.name).map(d => d.name));
                } catch (e) {
                    console.error("Weapon load error", e);
                    setWeaponNames([]);
                }
            } else {
                setWeaponNames([]);
            }

            // 3. Armor
            if (Array.isArray(classDetails.system.armor) && classDetails.system.armor.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.armor.map((u: string) => fetchDocument(u)));
                    setArmorNames(docs.filter(d => d && d.name).map(d => d.name));
                } catch (e) {
                    console.error("Armor load error", e);
                    setArmorNames([]);
                }
            } else {
                setArmorNames([]);
            }
        };

        loadDetails();
    }, [classDetails, formData.level0]);


    // Create Character
    const createCharacter = async () => {
        if (!formData.name) {
            alert('Please enter a name');
            return;
        }

        setLoading(true);

        try {
            // 1. Prepare Items & System Data Strings
            const items: any[] = [];

            // Helper to add item by UUID and return it
            const addItem = async (uuid: string) => {
                if (!uuid) return null;
                const doc = await fetchDocument(uuid);
                if (doc) {
                    // Clone and strip ID to ensure clean creation
                    const itemData = JSON.parse(JSON.stringify(doc));
                    delete itemData._id;
                    delete itemData.ownership;

                    // Attach Source ID for linking
                    if (!itemData.flags) itemData.flags = {};
                    if (!itemData.flags.core) itemData.flags.core = {};
                    itemData.flags.core.sourceId = uuid;

                    items.push(itemData);
                    return itemData;
                }
                return null;
            };

            await addItem(formData.ancestry);

            // Add Ancestry Fixed Talents & Choices
            for (const t of ancestryTalents.fixed) {
                await addItem(t.uuid);
            }
            for (const uuid of selectedAncestryTalents) {
                await addItem(uuid);
            }

            // Languages
            for (const l of knownLanguages.fixed) {
                await addItem(l.uuid);
            }
            if (languageConfig.fixed?.length > 0) {
                for (const uuid of languageConfig.fixed) {
                    await addItem(uuid);
                }
            }
            for (const uuid of knownLanguages.selected) {
                await addItem(uuid);
            }

            // Gear (Level 0)
            if (formData.level0 && gearSelected.length > 0) {
                for (const item of gearSelected) {
                    // Gear items are already fetched and stripped (mostly) in randomizeGear?
                    // Actually randomizeGear fetches docs. We should clean them too.
                    const cleanItem = JSON.parse(JSON.stringify(item));
                    delete cleanItem._id;
                    delete cleanItem.ownership;
                    items.push(cleanItem);
                }
            }

            await addItem(formData.background);

            if (!formData.level0) {
                await addItem(formData.class);
            }

            // Collect Language UUIDs for system.languages array
            const languageUuids: string[] = [];
            for (const l of knownLanguages.fixed) languageUuids.push(l.uuid);
            if (languageConfig.fixed?.length > 0) {
                for (const uuid of languageConfig.fixed) languageUuids.push(uuid);
            }
            for (const uuid of knownLanguages.selected) languageUuids.push(uuid);


            // 2. Prepare Actor Data
            const actorData = {
                name: formData.name,
                type: 'Player',
                img: 'icons/svg/mystery-man.svg',
                system: {
                    ancestry: formData.ancestry,   // Use UUID
                    background: formData.background, // Use UUID
                    class: formData.class || "",     // Use UUID if present
                    alignment: formData.alignment,
                    deity: formData.deity,
                    languages: languageUuids,
                    level: {
                        value: formData.level0 ? 0 : 1,
                        xp: 0,
                        next: formData.level0 ? 0 : 10
                    },
                    abilities: {
                        str: { mod: formData.stats.STR.mod, value: formData.stats.STR.value },
                        dex: { mod: formData.stats.DEX.mod, value: formData.stats.DEX.value },
                        con: { mod: formData.stats.CON.mod, value: formData.stats.CON.value },
                        int: { mod: formData.stats.INT.mod, value: formData.stats.INT.value },
                        wis: { mod: formData.stats.WIS.mod, value: formData.stats.WIS.value },
                        cha: { mod: formData.stats.CHA.mod, value: formData.stats.CHA.value }
                    },
                    attributes: {
                        hp: { value: formData.hp, max: formData.hp }
                    },
                    currency: {
                        gp: formData.gold
                    },
                    notes: formData.description
                },
                items: items
            };

            // 3. Send to API
            const res = await fetch('/api/actors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actorData)
            });

            const result = await res.json();
            if (result.success) {
                // Redirect to sheet
                window.location.href = `/actors/${result.id}`;
            } else {
                alert('Creation Failed: ' + result.error);
                setLoading(false);
            }
        } catch (e: any) {
            console.error(e);
            alert('Error: ' + e.message);
            setLoading(false);
        }
    };

    if (loading && !systemData) { // Only full load screen on initial system load
        // Return minimal skeleton or transparent loader to let dashboard transition look smoother?
        // Or a nicer themed loader.
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900 text-white">
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
                    <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-xl font-serif text-amber-500 animate-pulse">Summoning the Shadowdark...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col min-h-screen ${crimson.variable} ${inter.variable} font-sans bg-neutral-100 text-black pb-24`}>

            {/* Top Navigation Bar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 shadow-md flex items-center justify-between backdrop-blur-sm bg-opacity-95">
                <button
                    onClick={() => window.location.href = '/'}
                    className="flex items-center gap-2 text-neutral-400 hover:text-amber-500 transition-colors font-semibold group text-sm uppercase tracking-wide"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    Back to Dashboard
                </button>
                <div className="text-xs text-neutral-600 font-mono hidden md:block">
                    Generating New Character
                </div>
            </nav>

            {/* Main Header (Subheader) - Controls & Title */}
            <div className="bg-neutral-900 text-white shadow-md sticky top-[45px] z-10 flex items-center justify-between px-6 border-b-4 border-black h-24 mt-[45px]">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-neutral-800 border-2 border-white/10 flex items-center justify-center rounded">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-50">
                            <path d="M5.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM2.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM18.75 7.5a.75.75 0 00-1.5 0v2.25H15a.75.75 0 000 1.5h2.25v2.25a.75.75 0 001.5 0v-2.25H21a.75.75 0 000-1.5h-2.25V7.5z" />
                        </svg>
                    </div>
                    <div className="py-2">
                        <h1 className="text-3xl font-serif font-bold leading-none tracking-tight">Create Character</h1>
                        <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                            Shadowdark RPG
                        </p>
                    </div>
                </div>

                <div className="flex gap-6 items-center pr-2">
                    {/* Randomize Button */}
                    <button
                        onClick={randomizeAll}
                        className="group relative flex items-center justify-center -mb-2"
                        title="Randomize All"
                    >
                        <div className="w-14 h-14 flex items-center justify-center transition-transform group-hover:scale-110 bg-neutral-800 rounded-full border-2 border-neutral-700 group-hover:border-amber-500 shadow-lg">
                            <svg viewBox="0 0 100 100" className="w-8 h-8 fill-current text-white group-hover:text-amber-500">
                                <path d="M50 5 L93 25 L93 75 L50 95 L7 75 L7 25 Z" stroke="currentColor" strokeWidth="4" fill="none" />
                                <text x="50" y="66" fontSize="30" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none" style={{ fontFamily: 'var(--font-cinzel), serif' }}>20</text>
                            </svg>
                        </div>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-4 max-w-5xl mx-auto w-full pt-6 mb-20 space-y-8">

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

                    {/* Column 1: Type, Stats, HP, Gold */}
                    <div className="space-y-6">
                        {/* Name (Moved to top) */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1 flex justify-between items-center">
                                <span>Name</span>
                            </h2>
                            <div>
                                <input
                                    type="text"
                                    className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-1 font-serif text-lg font-bold placeholder:text-neutral-300"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Character Name"
                                />
                            </div>
                        </div>

                        {/* Level 0 Toggle */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1">Type</h2>
                            <div className="flex gap-4">
                                <label className={`flex-1 cursor-pointer p-3 border-2 ${formData.level0 ? 'bg-black text-white border-black' : 'bg-white text-neutral-400 border-neutral-200 hover:border-black'} transition-all text-center font-bold uppercase tracking-widest text-sm flex flex-col items-center justify-center gap-1`}>
                                    <input
                                        type="radio"
                                        name="level0"
                                        className="hidden"
                                        checked={formData.level0}
                                        onChange={() => setFormData(prev => ({ ...prev, level0: true }))}
                                    />
                                    <span>Level 0</span>
                                    <span className="text-[8px] opacity-70">Gauntlet</span>
                                </label>
                                <label className={`flex-1 cursor-pointer p-3 border-2 ${!formData.level0 ? 'bg-black text-white border-black' : 'bg-white text-neutral-400 border-neutral-200 hover:border-black'} transition-all text-center font-bold uppercase tracking-widest text-sm flex flex-col items-center justify-center gap-1`}>
                                    <input
                                        type="radio"
                                        name="level0"
                                        className="hidden"
                                        checked={!formData.level0}
                                        onChange={() => setFormData(prev => ({ ...prev, level0: false }))}
                                    />
                                    <span>Level 1</span>
                                    <span className="text-[8px] opacity-70">Hero</span>
                                </label>
                            </div>
                        </div>

                        {/* Stats Block */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm relative">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-1">
                                <h2 className="text-black font-black font-serif text-xl">Stats</h2>
                                <button onClick={rollStats} className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 hover:text-black transition-colors">
                                    <span className="fas fa-dice mr-1"></span>
                                    Roll 3d6
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(stat => {
                                    // @ts-ignore
                                    const st = formData.stats[stat];
                                    return (
                                        <div key={stat} className="flex items-center justify-between">
                                            <span className="font-bold text-neutral-500 text-sm tracking-widest">{stat}</span>
                                            <div className="flex items-center gap-3">
                                                <span className={`font-serif text-2xl font-bold ${st.value >= 15 ? 'text-amber-600' : 'text-black'}`}>{st.value}</span>
                                                <span className="text-xs font-bold bg-neutral-200 px-2 py-0.5 rounded-full text-neutral-600 min-w-[2rem] text-center">
                                                    {st.mod >= 0 ? '+' : ''}{st.mod}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* HP & Gold */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Hit Points */}
                            <div className="bg-white p-4 border-2 border-black shadow-sm">
                                <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2 flex justify-between items-center">
                                    <span>HP</span>
                                    <button onClick={calculateHP} className="text-neutral-300 hover:text-black transition-colors"><i className="fas fa-dice"></i></button>
                                </h2>
                                <div className="text-center">
                                    <span className="text-3xl font-black font-serif">{formData.hp}</span>
                                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                                        {(formData.level0 || !classDetails?.system?.hitPoints) ? "d4" : classDetails.system.hitPoints} + CON
                                    </p>
                                </div>
                            </div>

                            {/* Gold */}
                            <div className="bg-white p-4 border-2 border-black shadow-sm">
                                <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2 flex justify-between items-center">
                                    <span>Gold</span>
                                    <button onClick={calculateGold} className="text-neutral-300 hover:text-black transition-colors"><i className="fas fa-dice"></i></button>
                                </h2>
                                <div className="text-center">
                                    {
                                        formData.level0 ? (
                                            <>
                                                <span className="text-xl font-black font-serif">See Details</span>
                                                <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">Starting Gear</p>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-3xl font-black font-serif">{formData.gold}</span>
                                                <span className="text-xs font-bold text-neutral-400 ml-1">GP</span>
                                                <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">2d6 x 5</p>
                                            </>
                                        )
                                    }

                                </div>
                            </div>
                        </div>


                    </div>

                    {/* Column 2: Identity & Choices */}
                    <div className="space-y-6">
                        {/* Class */}
                        <div className={`bg-white p-6 border-2 border-black shadow-sm transition-opacity ${formData.level0 ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1 flex justify-between items-center">
                                <span>Class</span>
                            </h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                                value={formData.class}
                                onChange={(e) => setFormData(prev => ({ ...prev, class: e.target.value }))}
                                disabled={formData.level0}
                            >
                                <option value="" disabled={!formData.level0 && formData.class !== ""}>
                                    {formData.level0 ? "Gauntlet (No Class)" : "Choose Class..."}
                                </option>
                                {systemData?.classes?.filter((c: any) => c.name !== "Level 0").map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                            {formData.level0 && <p className="text-xs text-neutral-400 mt-2 text-center italic">Class is not available for Level 0 characters.</p>}
                        </div>

                        {/* Ancestry */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1 flex justify-between items-center">
                                <span>Ancestry</span>
                            </h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                                value={formData.ancestry}
                                onChange={(e) => setFormData(prev => ({ ...prev, ancestry: e.target.value }))}
                            >
                                <option value="">Select Ancestry...</option>
                                {systemData?.ancestries?.map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Background */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1 flex justify-between items-center">
                                <span>Background</span>
                            </h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                                value={formData.background}
                                onChange={(e) => setFormData(prev => ({ ...prev, background: e.target.value }))}
                            >
                                <option value="">Select Background...</option>
                                {systemData?.backgrounds?.map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Alignment */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1">Alignment</h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-1 font-serif text-lg"
                                value={formData.alignment}
                                onChange={(e) => setFormData(prev => ({ ...prev, alignment: e.target.value }))}
                            >
                                <option value="lawful">Lawful</option>
                                <option value="neutral">Neutral</option>
                                <option value="chaotic">Chaotic</option>
                            </select>
                        </div>

                        {/* Deity */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1">Deity</h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-1 font-serif text-lg"
                                value={formData.deity}
                                onChange={(e) => setFormData(prev => ({ ...prev, deity: e.target.value }))}
                            >
                                <option value="">None / Select...</option>
                                {/* Populate from systemData if available, or fetch */}
                                {systemData?.deities?.map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                        </div>


                    </div>
                </div>

                {/* Details Section (Full Width) */}
                <div className="bg-white p-4 border-2 border-black shadow-sm mt-4">
                    <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2">Details</h2>

                    <div className="p-4 space-y-1">

                        {/*          
                        // Need to see temp/shadowdark/templates/apps/character-generator/details.hbs
                        // Follow all leads implement each section as such
	<div class="content details">
		{{> apps/character-generator/details/class-description}}
		{{> apps/character-generator/details/ancestry-talents}}
		{{> apps/character-generator/details/weapons}}
		{{> apps/character-generator/details/armor}}
		{{> apps/character-generator/details/languages}}
		{{> apps/character-generator/details/patron}}
		{{> apps/character-generator/details/class-talents}}
		{{> apps/character-generator/details/gear}}
	</div>
        */}
                        {/* 1. Class Flavor Text (Description) */}
                        {classDetails?.system?.description && !formData.level0 && (
                            <div
                                className="mb-2 italic leading-tight"
                                dangerouslySetInnerHTML={{ __html: classDetails.system.description.value || classDetails.system.description }}
                            />
                        )}

                        {/* 2. Ancestry Talent/Feature */}
                        {ancestryDetails && (
                            <div className="mb-1">
                                <div className="leading-tight mb-2">
                                    {(() => {
                                        const rawDesc = ancestryDetails.system?.description?.value || ancestryDetails.system?.description || "";
                                        const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ');
                                        return <span dangerouslySetInnerHTML={{ __html: cleanDesc }} />;
                                    })()}
                                </div>

                                {ancestryTalents.fixed.map((talent, i) => (
                                    <div key={`anc-fixed-${i}`} className="mb-1 leading-tight">
                                        <span className="font-bold">{talent.name}. </span>
                                        <span dangerouslySetInnerHTML={{ __html: talent.description }}></span>
                                    </div>
                                ))}

                                {ancestryTalents.choice.length > 0 && (
                                    <div className="mt-2">
                                        <span className="font-bold italic text-neutral-600">
                                            Choose {ancestryTalents.choiceCount}:
                                        </span>
                                        <div className="mt-2">
                                            <span className="font-bold text-neutral-600 block mb-1">
                                                Ancestry Choice ({selectedAncestryTalents.length}/{ancestryTalents.choiceCount}):
                                            </span>

                                            {/* Show selected talents */}
                                            {selectedAncestryTalents.length > 0 && (
                                                <div className="ml-2 mb-2">
                                                    {ancestryTalents.choice
                                                        .filter(t => selectedAncestryTalents.includes(t.uuid))
                                                        .map((talent, i) => (
                                                            <div key={`sel-anc-${i}`} className="mb-1 leading-tight text-neutral-800">
                                                                <span className="font-bold text-xs">● {talent.name}. </span>
                                                                <span className="text-xs" dangerouslySetInnerHTML={{ __html: talent.description }}></span>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}

                                            {/* Selection Button */}
                                            <button
                                                onClick={() => setShowAncestryTalentsModal(true)}
                                                className={`text-xs px-2 py-1 rounded border ${selectedAncestryTalents.length === ancestryTalents.choiceCount
                                                    ? 'bg-neutral-100 text-neutral-600 border-neutral-300'
                                                    : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-300'
                                                    }`}
                                            >
                                                {selectedAncestryTalents.length === ancestryTalents.choiceCount ? 'Re-select Talents' : 'Select Talents'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Ancestry Talent Modal */}
                                {showAncestryTalentsModal && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                                        <div className="bg-white rounded shadow-lg max-w-md w-full max-h-[80vh] flex flex-col">
                                            <div className="p-3 border-b border-neutral-200 flex justify-between items-center bg-neutral-100 rounded-t">
                                                <h3 className="font-bold font-serif text-lg">Choose {ancestryTalents.choiceCount} Talent{ancestryTalents.choiceCount > 1 ? 's' : ''}</h3>
                                                <button
                                                    onClick={() => setShowAncestryTalentsModal(false)}
                                                    className="text-neutral-500 hover:text-black"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            <div className="p-4 overflow-y-auto">
                                                <div className="space-y-2">
                                                    {ancestryTalents.choice.map((t: any) => {
                                                        const isSelected = selectedAncestryTalents.includes(t.uuid);
                                                        const canSelect = isSelected || selectedAncestryTalents.length < ancestryTalents.choiceCount;

                                                        return (
                                                            <div
                                                                key={t.uuid || t.name} // Prefer UUID
                                                                onClick={() => {
                                                                    if (isSelected) {
                                                                        setSelectedAncestryTalents(prev => prev.filter(id => id !== t.uuid));
                                                                    } else if (canSelect) {
                                                                        setSelectedAncestryTalents(prev => [...prev, t.uuid]);
                                                                    }
                                                                }}
                                                                className={`p-2 border rounded cursor-pointer transition-colors ${isSelected
                                                                    ? 'border-indigo-500 bg-indigo-50'
                                                                    : canSelect
                                                                        ? 'hover:bg-neutral-50 border-neutral-200'
                                                                        : 'opacity-50 cursor-not-allowed border-neutral-100'
                                                                    }`}
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div className="font-bold text-sm">{t.name}</div>
                                                                    {isSelected && <span className="fas fa-check text-indigo-600"></span>}
                                                                </div>
                                                                <div className="text-xs text-neutral-600 mt-1" dangerouslySetInnerHTML={{ __html: t.description }}></div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="p-3 border-t border-neutral-200 bg-neutral-50 rounded-b text-right flex justify-between items-center">
                                                <span className="text-xs text-neutral-500">
                                                    {selectedAncestryTalents.length} / {ancestryTalents.choiceCount} selected
                                                </span>
                                                <button
                                                    onClick={() => setShowAncestryTalentsModal(false)}
                                                    className="px-3 py-1 bg-neutral-800 text-white hover:bg-black rounded text-sm disabled:opacity-50"
                                                    disabled={selectedAncestryTalents.length !== ancestryTalents.choiceCount}
                                                >
                                                    Confirm
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 3. Weapons */}
                        <div>
                            <span className="font-bold">Weapons: </span>
                            {formData.level0 ? (
                                <span>All weapons</span>
                            ) : (
                                <span>
                                    {(() => {
                                        if (!classDetails?.system) return "...";
                                        const s = classDetails.system;
                                        const parts = [];
                                        if (s.allWeapons) return "All weapons";
                                        if (s.allMeleeWeapons) parts.push("All melee weapons");
                                        if (s.allRangedWeapons) parts.push("All ranged weapons");
                                        if (s.weapons && Array.isArray(s.weapons)) {
                                            // Check if we have standard weapon permissions (All, Melee, Ranged)
                                            // If so, and the list is empty/UUIDs, we prefer the general text?
                                            // Actually, usually it's additive.
                                            // But if we have resolved names, use them.
                                            if (weaponNames.length > 0) {
                                                parts.push(weaponNames.join(", "));
                                            } else if (s.weapons.length > 0) {
                                                // Fallback to loading text if UUIDs present but not resolved yet
                                                parts.push("Loading...");
                                            }
                                        }
                                        return parts.length > 0 ? parts.join(", ") : "None";
                                    })()}
                                </span>
                            )}
                        </div>

                        {/* 4. Armor */}
                        <div>
                            <span className="font-bold">Armor: </span>
                            {formData.level0 ? (
                                <span>All armor, shields</span>
                            ) : (
                                <span>
                                    {(() => {
                                        if (!classDetails?.system) return "...";
                                        const s = classDetails.system;
                                        const parts = [];
                                        if (s.allArmor) return "All armor";
                                        if (s.armor && Array.isArray(s.armor)) {
                                            if (armorNames.length > 0) {
                                                parts.push(armorNames.join(", "));
                                            } else if (s.armor.length > 0) {
                                                parts.push("Loading...");
                                            }
                                        }
                                        return parts.length > 0 ? parts.join(", ") : "None";
                                    })()}
                                </span>
                            )}
                        </div>

                        {/* 5. Languages */}
                        {/* 5. Languages */}
                        <div>
                            <span className="font-bold">Languages: </span>
                            <span>
                                {[
                                    ...knownLanguages.fixed.map(l => l.name),
                                    ...(knownLanguages.selected.map(uuid => systemData?.languages?.find((l: any) => l.uuid === uuid)?.name).filter(Boolean))
                                ].join(", ") || "Common"}
                            </span>

                            {(languageConfig.common > 0 || languageConfig.rare > 0) && (
                                <button
                                    onClick={() => setShowLanguageModal(true)}
                                    className={`ml-2 text-xs px-2 py-1 rounded border ${knownLanguages.selected.length === (languageConfig.common + languageConfig.rare)
                                        ? 'bg-neutral-100 text-neutral-600 border-neutral-300'
                                        : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-300'
                                        }`}
                                >
                                    Select Languages ({knownLanguages.selected.length}/{languageConfig.common + languageConfig.rare})
                                </button>
                            )}
                        </div>

                        {/* 6. Patron */}
                        {classDetails?.system?.patron?.required && (
                            <div className="mb-2">
                                {/*<span className="font-bold">Patron: </span>*/}
                                {formData.patron && patronDetails ? (
                                    <span>
                                        <button
                                            onClick={() => setShowPatronModal(true)}
                                            className="text-[10px] uppercase bg-neutral-200 hover:bg-neutral-300 text-neutral-800 px-1 rounded mr-2 border border-neutral-400"
                                        >
                                            Edit/Change
                                        </button>
                                        <span className="font-bold">{patronDetails.name}: </span>
                                        <span className="italic text-neutral-600 text-sm">
                                            <span dangerouslySetInnerHTML={{ __html: (patronDetails.system?.description?.value || patronDetails.system?.description || "").replace(/<[^>]+>/g, ' ') }}></span>
                                        </span>
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setShowPatronModal(true)}
                                        className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded border border-red-300"
                                    >
                                        Select Patron
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Patron Selection Modal */}
                        {/* Patron Selection Modal */}
                        {showPatronModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                                <div className="bg-white rounded shadow-lg max-w-md w-full max-h-[80vh] flex flex-col">
                                    <div className="p-3 border-b border-neutral-200 flex justify-between items-center bg-neutral-100 rounded-t">
                                        <h3 className="font-bold font-serif text-lg">Choose Patron</h3>
                                        <button
                                            onClick={() => setShowPatronModal(false)}
                                            className="text-neutral-500 hover:text-black"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="p-4 overflow-y-auto">
                                        {!systemData?.patrons?.length ? (
                                            <p className="italic text-neutral-500">No patrons found in list.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {/* @ts-ignore */}
                                                {systemData.patrons.map((p: any) => (
                                                    <div
                                                        key={p.uuid}
                                                        onClick={() => {
                                                            setFormData(prev => ({ ...prev, patron: p.uuid }));
                                                            setShowPatronModal(false);
                                                        }}
                                                        className={`p-2 border rounded cursor-pointer hover:bg-neutral-50 ${formData.patron === p.uuid ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-200'}`}
                                                    >
                                                        <div className="font-bold text-sm">{p.name}</div>
                                                        <div className="text-xs text-neutral-600 line-clamp-2">
                                                            {(p.description || "").replace(/<[^>]+>/g, ' ')}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 border-t border-neutral-200 bg-neutral-50 rounded-b text-right">
                                        <button
                                            onClick={() => setShowPatronModal(false)}
                                            className="px-3 py-1 bg-neutral-200 hover:bg-neutral-300 rounded text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Language Selection Modal */}
                        {showLanguageModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                                <div className="bg-white rounded shadow-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
                                    <div className="p-3 border-b border-neutral-200 flex justify-between items-center bg-neutral-100 rounded-t">
                                        <h3 className="font-bold font-serif text-lg">Select Languages</h3>
                                        <button onClick={() => setShowLanguageModal(false)} className="text-neutral-500 hover:text-black">✕</button>
                                    </div>
                                    <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {['common', 'rare'].map(rarity => {
                                            const allowed = rarity === 'common' ? languageConfig.common : languageConfig.rare;
                                            if (allowed <= 0) return null;

                                            // @ts-ignore
                                            const options = systemData?.languages?.filter((l: any) => l.rarity === rarity || (rarity === 'common' && !l.rarity));
                                            const selectedInBucket = knownLanguages.selected.filter(uuid => {
                                                // @ts-ignore
                                                const l = systemData?.languages?.find((x: any) => x.uuid === uuid);
                                                return (l?.rarity || 'common') === rarity;
                                            });

                                            return (
                                                <div key={rarity}>
                                                    <h4 className="font-bold text-sm uppercase text-neutral-500 mb-2 border-b border-neutral-200 flex justify-between">
                                                        <span className="capitalize">{rarity} Languages</span>
                                                        <span>{selectedInBucket.length} / {allowed}</span>
                                                    </h4>
                                                    <div className="space-y-1">
                                                        {options.map((l: any) => {
                                                            const isFixed = knownLanguages.fixed.some(f => f.uuid === l.uuid);
                                                            if (isFixed) return null;

                                                            const isSelected = knownLanguages.selected.includes(l.uuid);
                                                            const canSelect = isSelected || selectedInBucket.length < allowed;

                                                            return (
                                                                <div
                                                                    key={l.uuid}
                                                                    onClick={() => {
                                                                        if (isSelected) {
                                                                            setKnownLanguages(prev => ({ ...prev, selected: prev.selected.filter(id => id !== l.uuid) }));
                                                                        } else if (canSelect) {
                                                                            setKnownLanguages(prev => ({ ...prev, selected: [...prev.selected, l.uuid] }));
                                                                        }
                                                                    }}
                                                                    className={`p-2 border rounded cursor-pointer text-sm ${isSelected ? 'bg-indigo-50 border-indigo-500 font-bold' :
                                                                        canSelect ? 'hover:bg-neutral-50 border-neutral-200' : 'opacity-50 cursor-not-allowed border-neutral-100'
                                                                        }`}
                                                                >
                                                                    {l.name}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="p-3 border-t border-neutral-200 bg-neutral-50 rounded-b text-right">
                                        <button
                                            onClick={() => setShowLanguageModal(false)}
                                            className="px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-900"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 7. Class Talents */}
                        {!formData.level0 && classDetails && (
                            <div className="mt-1">
                                {classTalents.fixed.map((talent, i) => (
                                    <div key={`fixed-${i}`} className="mb-1 leading-tight">
                                        <span className="font-bold">{talent.name}: </span>
                                        <span dangerouslySetInnerHTML={{ __html: talent.description }}></span>
                                    </div>
                                ))}

                                {classTalents.choiceCount > 0 && (
                                    <div className="mt-2">
                                        <span className="font-bold italic text-neutral-600">Choose {classTalents.choiceCount}:</span>
                                        {classTalents.choice.length > 0 ? (
                                            <div className="ml-2">
                                                {classTalents.choice.map((talent, i) => (
                                                    <div key={`choice-${i}`} className="mb-1 leading-tight text-neutral-700">
                                                        <span className="font-bold text-xs">○ {talent.name}: </span>
                                                        <span className="text-xs" dangerouslySetInnerHTML={{ __html: talent.description }}></span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="italic text-neutral-500"> (Options loading or see sheet)</span>
                                        )}
                                    </div>
                                )}

                                {classTalents.table && (
                                    <div className="mt-1 italic text-neutral-600">
                                        + Random Class Talent (Roll on table)
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 8. Gear */}
                        {/* 8. Gear */}
                        {formData.level0 && (
                            <div className="mt-2 text-sm">
                                <span className="font-bold">Starting Gear: </span>
                                {gearSelected.length > 0 ? (
                                    <ul className="list-disc list-inside text-sm ml-2 mt-1">
                                        {gearSelected.map((item, i) => (
                                            <li key={i}>
                                                {item.name}
                                                {item.system?.quantity > 1 ? ` (${item.system.quantity})` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span className="italic text-neutral-500">None</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>




                {/* Create Character CTA Button (Full Width Bottom) */}
                <div className="bg-neutral-900 text-white p-8 border-2 border-black shadow-lg flex flex-col items-center justify-center gap-4">
                    <p className="text-neutral-400 font-serif italic text-lg opacity-80">&quot;The darkness holds its breath...&quot;</p>
                    <button
                        onClick={createCharacter}
                        disabled={loading}
                        className="w-full max-w-md bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded shadow-lg uppercase tracking-widest text-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                    >
                        {loading ? 'Creating...' : 'Create Character'}
                    </button>
                    <p className="text-xs text-neutral-500">Creates a new actor in Foundry VTT</p>
                </div>
            </div>
        </div >
    );
}
