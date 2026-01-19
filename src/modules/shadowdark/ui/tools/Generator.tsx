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
    const [backgroundDetails, setBackgroundDetails] = useState<any>(null);

    const [formData, setFormData] = useState({
        level0: true,
        ancestry: '',
        class: '',
        background: '',
        alignment: 'neutral',
        deity: '',
        name: '',
        description: '',
        stats: {
            STR: { value: 10, mod: 0 },
            DEX: { value: 10, mod: 0 },
            CON: { value: 10, mod: 0 },
            INT: { value: 10, mod: 0 },
            WIS: { value: 10, mod: 0 },
            CHA: { value: 10, mod: 0 }
        }
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

    // Load System Data
    useEffect(() => {
        fetch('/api/system/data')
            .then(res => res.json())
            .then(data => {
                setSystemData(data);
                setLoading(false);
            })
            .catch(err => console.error('Failed to load system data', err));
    }, []);

    // Fetch Background Details on change
    useEffect(() => {
        if (!formData.background) {
            setBackgroundDetails(null);
            return;
        }
        fetchDocument(formData.background).then(data => setBackgroundDetails(data));
    }, [formData.background]);

    // Fetch Class Details on change
    useEffect(() => {
        if (!formData.class) {
            setClassDetails(null);
            return;
        }
        fetchDocument(formData.class).then(data => setClassDetails(data));
    }, [formData.class]);

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

        // 2. Roll Stats
        rollStats();

        // 3. Update State (Base)
        setFormData(prev => ({
            ...prev,
            ancestry: newAncestry,
            background: newBackground,
            class: newClass,
            alignment: newAlignment,
            deity: newDeity,
        }));

        // 4. Async Randomizations (Name)
        if (newAncestry) {
            await randomizeName(newAncestry);
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
    }, [formData.level0, systemData]);

    const [classTalentNames, setClassTalentNames] = useState<string[]>([]);

    // Effect: Load Class Details (Talents)
    useEffect(() => {
        if (!classDetails?.system?.talents || formData.level0) {
            setClassTalentNames([]);
            return;
        }

        const loadTalents = async () => {
            const names: string[] = [];

            // Fixed Talents
            for (const uuid of classDetails.system.talents) {
                try {
                    const doc = await fetchDocument(uuid);
                    if (doc?.name) names.push(doc.name);
                } catch (e) {
                    console.error("Failed to load talent", uuid);
                }
            }

            // Choice Count
            if (classDetails.system.talentChoiceCount > 0) {
                names.push(`+${classDetails.system.talentChoiceCount} Choice(s)`);
            }

            // Class Talent Table (e.g. Random 1st level talent for Fighter)
            // Some classes rely on a table roll for their main feature at lvl 1
            if (classDetails.system.classTalentTable) {
                names.push("+ Random Class Talent");
            }

            setClassTalentNames(names);
        };

        loadTalents();
    }, [classDetails, formData.level0]);


    // Create Character
    const createCharacter = async () => {
        if (!formData.name) {
            alert('Please enter a name');
            return;
        }

        setLoading(true);

        try {
            // 1. Prepare Items
            const items: any[] = [];

            // Helper to add item by UUID
            const addItem = async (uuid: string) => {
                if (!uuid) return;
                const itemData = await fetchDocument(uuid);
                if (itemData) items.push(itemData);
            };

            await addItem(formData.ancestry);
            await addItem(formData.background);
            if (!formData.level0) await addItem(formData.class);

            // 2. Prepare Actor Data
            const actorData = {
                name: formData.name,
                type: 'Player',
                img: 'icons/svg/mystery-man.svg',
                system: {
                    details: {
                        alignment: formData.alignment,
                        deity: formData.deity,
                        level: {
                            value: formData.level0 ? 0 : 1
                        }
                    },
                    abilities: {
                        str: { mod: formData.stats.STR.mod, base: formData.stats.STR.value },
                        dex: { mod: formData.stats.DEX.mod, base: formData.stats.DEX.value },
                        con: { mod: formData.stats.CON.mod, base: formData.stats.CON.value },
                        int: { mod: formData.stats.INT.mod, base: formData.stats.INT.value },
                        wis: { mod: formData.stats.WIS.mod, base: formData.stats.WIS.value },
                        cha: { mod: formData.stats.CHA.mod, base: formData.stats.CHA.value }
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
        return (
            <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
                <div className="text-2xl font-serif animate-pulse text-amber-500">Loading Shadowdark Data...</div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col min-h-screen ${crimson.variable} ${inter.variable} font-sans bg-neutral-100 text-black pb-24`}>
            {/* ... (Header remains same) ... */}

            {/* Top Navigation Bar */}
            <div className="bg-black text-neutral-400 text-xs font-bold uppercase tracking-widest flex items-center justify-between px-6 py-2 border-b border-white/10">
                <button
                    onClick={() => window.location.href = '/'}
                    className="hover:text-white transition-colors flex items-center gap-2"
                >
                    <span className="fas fa-arrow-left"></span>
                    Back to Dashboard
                </button>
                <span className="text-neutral-500">Generating New Character</span>
            </div>

            {/* Main Header (Subheader) - Controls & Title */}
            <div className="bg-neutral-900 text-white shadow-md sticky top-0 z-10 flex items-center justify-between px-6 border-b-4 border-black h-24">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-neutral-800 border-2 border-white/10 flex items-center justify-center rounded">
                        <span className="fas fa-user-plus text-3xl opacity-50"></span>
                    </div>
                    <div className="py-2">
                        <h1 className="text-3xl font-serif font-bold leading-none tracking-tight">Generator</h1>
                        <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                            Shadowdark RPG
                        </p>
                    </div>
                </div>

                <div className="flex gap-6 items-center pr-2">
                    {/* Randomize Button (Mimics Stat Block) */}
                    <button
                        onClick={randomizeAll}
                        className="flex flex-col items-center group -mb-1"
                        title="Randomize All"
                    >
                        <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest group-hover:text-amber-500 transition-colors">Random</span>
                        <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110">
                            <span className="fas fa-dice text-2xl text-white group-hover:text-amber-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]"></span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-4 max-w-5xl mx-auto w-full pt-6 mb-20 space-y-8">

                {/* Main Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* ... (Columns 1, 2, 3 remain same) ... */}
                    {/* Column 1: Core Identity */}
                    <div className="space-y-6">
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
                    </div>

                    {/* Column 2: Stats & Class */}
                    <div className="space-y-6">
                        {/* Stats */}
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <div className="flex justify-between items-center border-b-2 border-black mb-4 pb-1">
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

                        {/* Class Selector */}
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
                                <option value="">Select Class...</option>
                                {systemData?.classes?.map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                            {formData.level0 && <p className="text-xs text-neutral-400 mt-2 text-center italic">Class is not available for Level 0 characters.</p>}
                        </div>
                    </div>

                    {/* Column 3: Identity */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 border-2 border-black shadow-sm">
                            <h2 className="text-black font-black font-serif text-xl border-b-2 border-black mb-4 pb-1">Identity</h2>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Name</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-1 font-serif text-lg font-bold placeholder:text-neutral-300"
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Character Name"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Alignment</label>
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

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Deity</label>
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
                    </div>
                </div>

                <div className="bg-[#eaeae5] border-2 border-black font-sans text-sm text-black">
                    {/* Header */}
                    <div className="bg-black text-white font-serif font-black text-xl p-2 mb-2 flex items-center justify-between">
                        <span>DETAILS</span>
                        <div className="h-6 w-6 relative opacity-80">
                            {/* Icon placeholder for visual balance */}
                            <span className="fas fa-scroll"></span>
                        </div>
                    </div>

                    {/* Content - Strictly ordered per user request & Foundry module */}
                    <div className="p-4 space-y-1">

                        {/* 1. Class Flavor Text (Description) */}
                        {classDetails?.system?.description && !formData.level0 && (
                            <div
                                className="mb-2 italic leading-tight"
                                dangerouslySetInnerHTML={{ __html: classDetails.system.description.value || classDetails.system.description }}
                            />
                        )}

                        {/* 2. Ancestry Talent/Feature (e.g. Stealthy) */}
                        {ancestryDetails && (
                            <div className="mb-1">
                                {(() => {
                                    // Try to find a 'feature' or 'talent' description if possible, otherwise use generic description
                                    // The user example shows "Stealthy. Once per day..." which is likely the ancestry description or a specific item.
                                    // We'll strip HTML from the description to match the clean text look.
                                    const rawDesc = ancestryDetails.system?.description?.value || ancestryDetails.system?.description || "";
                                    const cleanDesc = rawDesc.replace(/<[^>]+>/g, '');
                                    // If we had specific talent items, we'd list them here. For now, use the description which usually contains it.
                                    return (
                                        <span dangerouslySetInnerHTML={{ __html: cleanDesc }} />
                                    );
                                })()}
                            </div>
                        )}

                        {/* 3. Weapons */}
                        <div>
                            <span className="font-bold">Weapons: </span>
                            {classDetails?.system ? (
                                <span>
                                    {classDetails.system.allWeapons ? "All weapons" :
                                        classDetails.system.allMeleeWeapons && classDetails.system.allRangedWeapons ? "All weapons" :
                                            classDetails.system.allMeleeWeapons ? "All melee weapons" :
                                                classDetails.system.allRangedWeapons ? "All ranged weapons" :
                                                    "See sheet"}
                                </span>
                            ) :
                                // Level 0 default
                                formData.level0 ? "All weapons" : "..."
                            }
                        </div>

                        {/* 4. Armor */}
                        <div>
                            <span className="font-bold">Armor: </span>
                            {classDetails?.system ? (
                                <span>
                                    {classDetails.system.allArmor ? "All armor" :
                                        classDetails.system.armor?.length > 0 ? "See sheet" :
                                            // Fallback if no specific armor listed and flag is false (e.g. Wizard)
                                            "None"}
                                </span>
                            ) :
                                // Level 0 default
                                formData.level0 ? "All armor" : "..."
                            }
                        </div>

                        {/* 5. Languages */}
                        <div>
                            <span className="font-bold">Languages: </span>
                            {(() => {
                                const langs: string[] = [];
                                if (ancestryDetails) langs.push("Common");

                                // Ancestry Select
                                const ancSelect = ancestryDetails?.system?.languages?.select || 0;
                                if (ancSelect > 0) langs.push(`+${ancSelect} others`);

                                // Class Select
                                if (!formData.level0 && classDetails) {
                                    const clsSelect = classDetails.system?.languages?.select || 0;
                                    // Some classes allow choosing rare/common
                                    if (clsSelect > 0) langs.push(`+${clsSelect} class languages`);

                                    // Fixed Class IDs - we'd need to resolve these names but for now we skip complex mapping
                                    // If we had the systemData.languages mapping we could look them up.
                                    // systemData.languages has { name, uuid ... }
                                    if (classDetails.system?.languages?.fixed?.length > 0) {
                                        classDetails.system.languages.fixed.forEach((uuid: string) => {
                                            const known = systemData?.languages?.find((l: any) => l.uuid === uuid);
                                            if (known) langs.push(known.name);
                                        });
                                    }
                                }

                                return langs.length > 0 ? langs.join(", ") : "Common";
                            })()}
                        </div>

                        {/* 6. Patron (Warlock/Cleric) */}
                        {classDetails?.system?.patron?.required && (
                            <div>
                                <span className="font-bold">Patron: </span>
                                <span className="italic text-neutral-600">
                                    {/* Ideally we would pick a patron here if we had the table */}
                                    Randomly selected during creation...
                                </span>
                            </div>
                        )}

                        {/* 7. Class Talents (Level 1) */}
                        {/* 7. Class Talents (Level 1) */}
                        {!formData.level0 && classDetails && (
                            <div className="mt-1">
                                <span className="font-bold">Class Talent: </span>
                                <span className="italic text-neutral-600">
                                    {classTalentNames.length > 0 ?
                                        classTalentNames.join(", ") :
                                        (classDetails.system.talents?.length > 0 ? "Loading..." : "See sheet")}
                                </span>
                            </div>
                        )}

                        {/* 8. Starting Gear (LEVEL 0 ONLY) */}
                        {formData.level0 && (
                            <div className="mt-2 text-sm">
                                <span className="font-bold">Starting Gear: </span>
                                <span className="italic text-neutral-600">Randomized Level 0 Gear...</span>
                            </div>
                        )}

                    </div>
                </div>

                {/* Personal Notes (Kept separate but styled inline with the clean aesthetic) */}
                <div className="bg-white p-4 border-2 border-black shadow-sm mt-4">
                    <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2">Personal Notes</h2>
                    <textarea
                        className="w-full h-20 bg-transparent border-0 focus:ring-0 p-0 outline-none resize-none font-sans text-sm placeholder:italic"
                        placeholder="Character appearance, backstory, or lucky charm..."
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    ></textarea>
                </div>


                {/* Create Character CTA Button (Full Width Bottom) */}
                <div className="bg-neutral-900 text-white p-8 border-2 border-black shadow-lg flex flex-col items-center justify-center gap-4">
                    <p className="text-neutral-400 font-serif italic text-lg opacity-80">"The darkness holds its breath..."</p>
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
        </div>
    );
}
