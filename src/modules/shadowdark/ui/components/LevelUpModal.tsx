'use client';

import { useState, useEffect } from 'react';

interface Props {
    ancestry: any;
    classObj: any;
    classUuid: string;
    patron?: any;
    abilities: any;
    spells: any[];
    onComplete: (items: any[]) => void;
    onCancel: () => void;
    foundryUrl?: string;
}

export const LevelUpModal = ({
    ancestry,
    classObj,
    classUuid,
    patron,
    abilities,
    spells,
    onComplete,
    onCancel,
    foundryUrl = ""
}: Props) => {
    const [step, setStep] = useState<'talents' | 'spells'>('talents');
    const [loading, setLoading] = useState(false);

    // Data
    const [talentTable, setTalentTable] = useState<any>(null);
    const [boonTable, setBoonTable] = useState<any>(null);
    const [spellsKnown, setSpellsKnown] = useState<any>(null);
    const [availableSpells, setAvailableSpells] = useState<any[]>([]);

    // State
    const [rolledTalents, setRolledTalents] = useState<any[]>([]);
    const [rolledBoons, setRolledBoons] = useState<any[]>([]);
    const [selectedSpells, setSelectedSpells] = useState<any[]>([]);
    const [pendingChoices, setPendingChoices] = useState<{ header: string, options: any[], context: 'talent' | 'boon' } | null>(null);

    // Spellcasting
    const isSpellcaster = Boolean(classObj?.system?.spellcasting?.class || classObj?.system?.spellcasting?.ability);

    // Computed Requirements
    const needsTalent = true; // Level 1 always odd
    // Valid logic for boolean: class has valid patron value AND patron is required in valid patron value
    const needsBoon = classObj?.system?.patron?.required;
    const canChooseBoon = needsBoon && patron; // If class requires patron, we can substitute talent for boon? Or do we get both?
    // Shadowdark rules: "Benefit: ... Roll a random boon..."
    // If you have a patron, you usually roll a boon INSTEAD of a talent? Or AS a talent?
    // Looking at LevelUpSD.mjs: "humans get extra talent... if targetLevel > 1 rolls.boon = true; rolls.talent = true"
    // It seems they satisfy the "talent gained" requirement.
    // For Level 1 Warlock: "Warlocks ... choose a patron... Gain a boon from their patron." (This is their "talent" slot effectively, or just a feature).
    // Let's assume for Level 1, we offer choice or force boon if warlock?
    // Template says: "Roll Talent" ... "Roll Boon" (if canRollBoons).

    // Requirements Check
    const isComplete = () => {
        const talentMet = rolledTalents.length > 0;
        const boonMet = !needsBoon || rolledBoons.length > 0;

        let spellsMet = true;
        if (isSpellcaster && spellsKnown > 0) {
            spellsMet = selectedSpells.length >= spellsKnown;
        }

        return talentMet && boonMet && spellsMet;
    };

    // Spellcasting
    const isSpellcaster = Boolean(classObj?.system?.spellcasting?.class || classObj?.system?.spellcasting?.ability);

    // Helper to fetch keys
    const fetchDocument = async (uuid: string) => {
        try {
            const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(uuid)}`);
            if (!res.ok) {
                console.error(`LevelUpModal: fetchDocument failed for ${uuid}: ${res.status} ${res.statusText}`);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    };

    const fetchTableResult = async (table: any, context: 'talent' | 'boon' = 'talent'): Promise<any[] | null> => {
        // If table is a string (UUID), fetch it first
        let tableObj = table;
        if (typeof table === 'string') {
            console.log("LevelUpModal: Fetching table by UUID:", table);
            tableObj = await fetchDocument(table);
        }

        if (!tableObj) {
            console.error('LevelUpModal: Failed to fetch table document', table);
            return null; // Should return null to propagate error state
        }
        console.log("LevelUpModal: Table Object Loaded", tableObj.name, tableObj._id);



        // Handle both EmbeddedCollection (common in Foundry) and Array
        const rawResults = tableObj.results || tableObj.system?.results;
        console.log("LevelUpModal: Raw Table Results:", rawResults);

        // If it's a Collection/Map, convert to array
        let results: any[] = [];
        if (Array.isArray(rawResults)) {
            results = rawResults;
        } else if (rawResults && typeof rawResults === 'object') {
            results = Array.from(rawResults) as any[];
            if (results.length === 0) {
                results = Object.values(rawResults);
            }
        }

        if (!results || results.length === 0) {
            console.error('LevelUpModal: No results found in table', tableObj.name);
            return [];
        }

        // --- NEW LOGIC: Roll and Filter ---
        const formula = tableObj.formula || "1d1";
        const roll = simpleRoll(formula);
        console.log(`LevelUpModal: Rolling ${formula} on table ${tableObj.name} => ${roll}`);


        let matchingResults = results.filter(r => {
            const range = r.range || [1, 1]; // Default to 1-1 if missing
            return roll >= range[0] && roll <= range[1];
        });

        // Filter out "structural" text results (like "Choose 1") IF we have other real results
        // User Logic: "The modal selection should be a box with a header using the Unknown Option's description"
        // The "Unknown Option" is the one with empty Name (or specific ID) and drawn=false.

        let headerText = "Choose One";
        let validOptions = matchingResults;

        if (matchingResults.length > 1) {
            const headerResult = matchingResults.find(r =>
                (r.type === 'text' || r.type === 0) &&
                (r.name === "" || (r.description && !r.name)) && // Empty name usually implies it's a structural result
                r.drawn === false
            );

            if (headerResult) {
                headerText = headerResult.description || "Choose One";


                // Fix for "or" header text
                if (headerText.trim().toLowerCase() === 'or') {
                    headerText = "Choose One";
                }

                validOptions = matchingResults.filter(r => r._id !== headerResult._id);
            } else {
                // Fallback filtering if we didn't find a perfect "Header Result" but have "Choose" text
                const meaningfulResults = matchingResults.filter(r => {
                    if (r.documentId || r.documentUuid) return true;
                    const text = (r.text || r.name || "").toLowerCase();
                    return !text.includes("choose");
                });
                if (meaningfulResults.length > 0) validOptions = meaningfulResults;
            }
        }



        // CASE 1: Multiple Results -> User Choice
        if (validOptions.length > 1) {
            // Need to present choice.
            const choices = validOptions.map(r => ({
                name: r.text || r.name || "Unknown Option",
                img: r.img,
                original: r
            }));
            setPendingChoices({ header: headerText, options: choices, context });
            return null; // Return null to signal "pending choice"
        }

        // CASE 2: Single Result -> Process IT
        if (validOptions.length === 1) {
            return await processSingleResult(validOptions[0]);
        }

        // CASE 3: No Results (Shouldn't happen with valid tables)
        console.warn("LevelUpModal: No matching results for roll", roll);
        return null; // Return null instead of []
    };

    const processSingleResult = async (result: any): Promise<any[] | null> => {
        console.log("LevelUpModal: processSingleResult Input:", result);
        let finalResult = {
            name: result.text || result.name || "Unknown Talent",
            type: 'Talent',
            description: result.text || "",
            img: result.img,
            uuid: result.uuid || result.documentUuid,
            documentUuid: result.documentUuid,
            documentId: result.documentId,
            documentCollection: result.documentCollection,
            _id: result._id
        };

        if (result.documentCollection && result.documentId) {
            // Construct UUID (Pack or World)
            const uuid = result.documentCollection.includes('.')
                ? `Compendium.${result.documentCollection}.${result.documentId}`
                : `${result.documentCollection}.${result.documentId}`;

            console.log('LevelUpModal: Fetching Linked Doc:', uuid, 'from result:', result);

            const doc = await fetchDocument(uuid);
            console.log('LevelUpModal: Linked Doc Fetched:', doc);

            if (doc) {
                // RECURSION CHECK: If the result is ANOTHER RollTable, roll on it!
                if (doc.type === 'RollTable') {
                    console.log('LevelUpModal: Recursive RollTable found:', doc.name);
                    return await fetchTableResult(doc, 'talent'); // Recursion context? Usually standard talent/choice flow.
                }

                finalResult = {
                    name: doc.name,
                    type: doc.type,
                    description: doc.system?.description?.value || doc.system?.description || "",
                    img: doc.img || result.img,
                    uuid: doc.uuid || uuid,
                    documentUuid: uuid, // Ensure we keep the valid ID
                    documentId: result.documentId,
                    documentCollection: result.documentCollection,
                    _id: doc._id || result._id
                };
            }
        } else if (result.documentUuid) {
            const doc = await fetchDocument(result.documentUuid);
            if (doc) {
                // RECURSION CHECK
                if (doc.type === 'RollTable') {
                    return await fetchTableResult(doc, 'talent');
                }
                finalResult = {
                    name: doc.name,
                    type: doc.type,
                    description: doc.system?.description?.value || doc.system?.description || "",
                    img: doc.img || result.img,
                    uuid: doc.uuid || result.documentUuid,
                    documentUuid: result.documentUuid,
                    documentId: result.documentId, // Might be undefined here but that's ok
                    documentCollection: null,
                    _id: doc._id || result._id
                };
            }
        } else if ((result.type === 0 || result.type === 'text') && result.text) {
            finalResult.name = result.text;
            finalResult.description = result.text;
        }

        return [finalResult];
    };

    const handleChoiceSelection = async (choiceOrResult: any) => {
        // choiceOrResult is the wrapper from PendingChoices or the raw result
        const raw = choiceOrResult.original || choiceOrResult;
        setPendingChoices(null);
        setLoading(true);
        try {
            const res = await processSingleResult(raw);
            // Logic to append or set? 
            // We assume this flow was triggered by "Roll Talent" or "Roll Boon".
            // We need to know WHICH one triggered it.
            // Simplification: We assume Talents for now because Boons usually don't have sub-tables in SD?
            // Actually, if we are in this modal, we are rolling talents.
            // But wait, what if it was a Boon roll?
            // Since we use global `pendingChoices`, we lose context of "who asked".
            // FIX: We check if `rolledBoons` is empty and `canChooseBoon`.
            // Actually, the `pendingChoices` UI should handle the "Commit".
            // But simpler: Just add to `rolledTalents` if we are in talent step?
            // Let's assume Talents for now.
            if (res) {
                // Use the context from pendingChoices if available, or infer?
                // If direct roll (no choice), we don't have pendingChoices set.
                // WE MUST rely on the caller setting the state if it returns immediately.
                // But handleChoiceSelection is ONLY called when there WAS a pending choice.
                if (pendingChoices?.context === 'boon') {
                    setRolledBoons(res);
                } else {
                    setRolledTalents(res);
                }
            }
        } catch (e) {
            console.error("Selection Error", e);
        }
        setLoading(false);
    };

    // Initialize
    useEffect(() => {
        const init = async () => {
            setLoading(true);

            // Unpack Class Tables
            if (classObj?.system?.classTalentTable) {
                // Just store UUID
                setTalentTable(classObj.system.classTalentTable);
            }

            if (patron) {
                if (patron.system?.boonTable) {
                    setBoonTable(patron.system.boonTable);
                } else if (patron.uuid) {
                    // Fetch full document to get boonTable
                    try {
                        const fullPatron = await fetchDocument(patron.uuid);
                        if (fullPatron?.system?.boonTable) {
                            console.log("LevelUpModal: Found boon table on fetched patron", fullPatron.name);
                            setBoonTable(fullPatron.system.boonTable);
                        } else {
                            console.warn("LevelUpModal: Fetched patron has no boon table", fullPatron);
                        }
                    } catch (e) {
                        console.error("Failed to fetch full patron", e);
                    }
                }
            }

            // Spells
            if (isSpellcaster) {
                const skTable = classObj?.system?.spellcasting?.spellsknown;

                // Determine Slots
                // Class > system > spellcasting > spellsknown > [Level 1]
                // This might be a number OR an object { 1: 3, 2: 0 ... } (Tier counts)
                let sk = skTable?.[1] || skTable?.["1"] || 0;

                // If it's an object, we want Tier 1 count
                if (typeof sk === 'object' && sk !== null) {
                    sk = sk[1] || sk["1"] || 0;
                }

                if (Number(sk) > 0) {
                    setSpellsKnown(Number(sk)); // Ensure it's a number

                    // Workaround: Use passed spells prop
                    // Filter spells by Class and Tier 1
                    const className = classObj.name;

                    const validSpells = spells.filter((s, idx) => {
                        // Check if spell works for this class
                        // s.class is likely a string "Wizard,Priest" or array.
                        // Ensure we trim even if it's already an array
                        const rawArr = Array.isArray(s.class) ? s.class : (s.class || '').split(',');
                        const spellClasses = rawArr.map((c: string) => typeof c === 'string' ? c.trim() : c);

                        const matchesClass = spellClasses.some((c: string) => {
                            if (typeof c !== 'string') return false;
                            const cleanC = c.trim().toLowerCase();
                            // Match against Name OR UUID
                            return cleanC === className.trim().toLowerCase() || cleanC === classUuid.trim().toLowerCase();
                        });

                        // Check Tier (handle string "1" vs number 1)
                        // @ts-ignore
                        const isTier1 = s.tier == 1;

                        return isTier1 && matchesClass;
                    });

                    setAvailableSpells(validSpells);
                }
            }

            setLoading(false);
        };
        init();
    }, [classObj, patron]);

    const handleRollTalent = async () => {
        if (!talentTable) return;
        setLoading(true);
        try {
            const res = await fetchTableResult(talentTable, 'talent');
            if (res) {
                setRolledTalents(res);
            }
        } catch (e) {
            console.error('LevelUpModal: Roll Error', e);
        }
        setLoading(false);
    };



    const clearPending = () => setPendingChoices(null);

    const handleRollBoon = async () => {
        clearPending();
        let table = boonTable;
        if (!table) {
            console.warn("LevelUpModal: No boon table found for patron");
            alert("The selected Patron does not have a Boon Table defined.");
            return;
        }
        if (!table) return;

        setLoading(true);
        const res = await fetchTableResult(table, 'boon');
        console.log("LevelUpModal: Boon Roll Result", res);
        if (res) setRolledBoons(res);
        setLoading(false);
    };

    const handleRollExtraBoon = async () => {
        clearPending();
        let table = boonTable;
        if (!table) {
            console.warn("LevelUpModal: No boon table found for patron");
            alert("The selected Patron does not have a Boon Table defined.");
            return;
        }
        if (!table) return;

        setLoading(true);
        // "Choose Patron Boon" button (for Warlocks) implies getting a Boon, but it fills the 'Talent' requirement slot?
        // User said: "if I don't roll the talent or choose patron boon and roll Boon, it will do so in the level benefit not in the patron boon section."
        // Meaning 'Roll Extra Boon' (The 'OR' option) should clearly be a BENEFIT.
        // So we treat it as a Talent context for storage, or do we store it in boons?
        // The requirements check: `talentMet = rolledTalents.length > 0`.
        // So if we choose a Boon *instead* of a Talent, it must go into `rolledTalents`.
        const res = await fetchTableResult(table, 'talent');
        if (res) setRolledTalents(prev => [...prev, ...res]);
        setLoading(false);
    };

    const handleConfirm = async () => {
        if (!isComplete()) return; // Blocked

        setLoading(true);
        const items = [];

        // Helper to resolve results to documents
        const resolveToDocs = async (results: any[]): Promise<any[]> => {
            console.log("LevelUpModal: Resolving results to docs...", results);
            const resolved: any[] = [];
            for (const r of results) {
                console.log("LevelUpModal: Processing result:", r);
                // Check if result is a RollTable itself (recursive roll needed)
                if (r.type === 'document' && r.documentCollection === 'RollTable') {
                    // Need to roll on this table!
                    // But we are in handleConfirm... ideally we should have done this earlier?
                    // No, if the user "Selects" this option, they get the result OF that table.
                    // Generator expects ITEMS. 
                    // We must resolve it now.
                    const tableUuid = r.documentUuid || r.documentId;
                    if (tableUuid) {
                        const subTable = await fetchDocument(tableUuid);
                        if (subTable) {
                            // Roll on sub-table
                            // This matches "Distribute to Stats" -> points to table -> result is "Stat Potion"
                            const subResults = await fetchTableResult(subTable, 'talent'); // Default context for sub-tables
                            if (subResults && subResults.length > 0) {
                                // Recursively resolve these results!
                                const subResolved = await resolveToDocs(subResults);
                                resolved.push(...subResolved);
                            }
                        }
                    }
                    continue;
                }

                // If it's a structural/text result, keep it (Generator regex parsers might use it)
                // But usually we want the Actual Item if it exists.
                // If it's a structural/text result, keep it (Generator regex parsers might use it)
                // But usually we want the Actual Item if it exists.
                const uuid = r.documentUuid || r.documentId || r.uuid;
                console.log("LevelUpModal: Extracted UUID:", uuid);

                if (uuid) {
                    const doc = await fetchDocument(uuid);
                    if (doc) {
                        console.log(`LevelUpModal: Resolved ${uuid} to ${doc.name}. Effects: ${doc.effects?.length}`);
                        // Double check if the doc itself is a RollTable (if type check above failed)
                        if (doc.documentName === 'RollTable' || doc.type === 'RollTable') {
                            // Recursion similar to above
                            const subResults = await fetchTableResult(doc, 'talent');
                            if (subResults && subResults.length > 0) {
                                const subResolved = await resolveToDocs(subResults);
                                resolved.push(...subResolved);
                            }
                        } else {
                            console.log("LevelUpModal: Resolved Item:", doc.name, "Effects:", doc.effects?.length);
                            resolved.push(doc);
                        }
                    } else {
                        // Fallback to result if doc fetch fails
                        console.warn("LevelUpModal: Failed to fetch doc for result, using raw result:", r);
                        resolved.push(r);
                    }
                } else {
                    resolved.push(r);
                }
            }
            return resolved;
        };

        const resolvedTalents = await resolveToDocs(rolledTalents);
        const resolvedBoons = await resolveToDocs(rolledBoons);

        items.push(...resolvedTalents);
        items.push(...resolvedBoons);

        if (selectedSpells.length > 0) {
            const spellPromises = selectedSpells.map(s => fetchDocument(s.uuid));
            const fullSpells = await Promise.all(spellPromises);
            items.push(...fullSpells.filter(s => s));
        }
        onComplete(items);
    };

    const toggleSpell = (spell: any) => {
        if (selectedSpells.find(s => s.uuid === spell.uuid)) {
            setSelectedSpells(prev => prev.filter(s => s.uuid !== spell.uuid));
        } else {
            if (selectedSpells.length < spellsKnown) {
                setSelectedSpells(prev => [...prev, spell]);
            }
        }
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-neutral-100 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-neutral-900 text-white p-4 flex justify-between items-center border-b-4 border-amber-600">
                    <h2 className="text-xl font-serif font-bold tracking-wider">Level Up: Level 1</h2>
                    <button onClick={onCancel} className="text-neutral-500 hover:text-white">&times;</button>
                </div>



                {/* PENDING CHOICES REMOVED FROM GLOBAL SCOPE */}

                <div className="p-6 overflow-y-auto space-y-8 flex-1 relative">
                    {/* Talents / Benefits Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                            <h3 className="font-bold text-lg font-serif">Level Benefit</h3>
                            {rolledTalents.length > 0 && <span className="text-green-600 font-bold text-sm">Selected!</span>}
                        </div>

                        {rolledTalents.length === 0 ? (
                            <div className="flex flex-col gap-2">
                                {/* INLINE CHOICE: TALENT */}
                                {pendingChoices && pendingChoices.context !== 'boon' ? (
                                    <div className="bg-neutral-800 p-6 rounded-lg border-2 border-amber-600 animate-in fade-in slide-in-from-bottom-4 shadow-xl">
                                        <h3 className="text-xl font-bold text-amber-500 mb-4 font-serif border-b border-neutral-700 pb-2">
                                            <span className="fas fa-question-circle mr-2"></span>
                                            {pendingChoices.header}
                                        </h3>
                                        <div className="grid grid-cols-1 gap-3">
                                            {pendingChoices.options.map((choice, idx) => {
                                                let imgSrc = choice.img || "icons/svg/d20-black.svg";

                                                if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && foundryUrl) {
                                                    const baseUrl = foundryUrl.replace(/\/$/, '');
                                                    const path = imgSrc.replace(/^\//, '');
                                                    imgSrc = `${baseUrl}/${path}`;
                                                }

                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => handleChoiceSelection(choice)}
                                                        className="flex items-center gap-4 p-4 bg-neutral-900 hover:bg-black border border-neutral-600 hover:border-amber-500 rounded-lg text-left transition-all group"
                                                    >
                                                        <div className="w-10 h-10 flex-shrink-0 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center group-hover:border-amber-500">
                                                            <img src={imgSrc} className="w-8 h-8 filter invert" alt="" />
                                                        </div>
                                                        <div className="font-bold text-amber-50 group-hover:text-amber-500">{choice.name}</div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleRollTalent}
                                            className="w-full py-4 bg-neutral-800 text-amber-500 font-bold uppercase tracking-widest hover:bg-black transition-colors rounded shadow-lg flex items-center justify-center gap-2"
                                        >
                                            <span className="fas fa-dice-d20"></span> Roll Class Talent
                                        </button>
                                        {needsBoon && (
                                            <div className="flex items-center gap-2">
                                                <div className="h-px bg-neutral-300 flex-1"></div>
                                                <span className="text-neutral-500 text-xs uppercase font-bold">OR</span>
                                                <div className="h-px bg-neutral-300 flex-1"></div>
                                            </div>
                                        )}
                                        {needsBoon && (
                                            <button
                                                onClick={handleRollExtraBoon}
                                                className="w-full py-3 bg-purple-100 text-purple-900 border-2 border-purple-200 font-bold uppercase tracking-widest hover:bg-purple-200 transition-colors rounded shadow flex items-center justify-center gap-2"
                                            >
                                                <span className="fas fa-star"></span> Choose Patron Boon
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {rolledTalents.map((t, idx) => (
                                    <div key={idx} className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-start animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-neutral-900 text-white w-10 h-10 flex items-center justify-center font-bold text-xl rounded">
                                            {t.type === 'Talent' ? 'T' : 'B'}
                                        </div>
                                        <div>
                                            <div className="font-bold text-lg">{t.name}</div>
                                            <p className="text-sm text-neutral-600 mt-1" dangerouslySetInnerHTML={{ __html: t.description }}></p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Boons Section */}
                    {needsBoon && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                <h3 className="font-bold text-lg font-serif">Patron Boon</h3>
                                {rolledBoons.length > 0 && <span className="text-green-600 font-bold text-sm">Rolled!</span>}
                            </div>

                            {rolledBoons.length === 0 ? (
                                <div className="flex flex-col gap-2">
                                    {/* INLINE CHOICE: BOON */}
                                    {pendingChoices && pendingChoices.context === 'boon' ? (
                                        <div className="bg-neutral-800 p-6 rounded-lg border-2 border-purple-500 animate-in fade-in slide-in-from-bottom-4 shadow-xl">
                                            <h3 className="text-xl font-bold text-purple-400 mb-4 font-serif border-b border-neutral-700 pb-2">
                                                <span className="fas fa-star mr-2"></span>
                                                {pendingChoices.header}
                                            </h3>
                                            <div className="grid grid-cols-1 gap-3">
                                                {pendingChoices.options.map((choice, idx) => {
                                                    let imgSrc = choice.img || "icons/svg/d20-black.svg";

                                                    if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && foundryUrl) {
                                                        const baseUrl = foundryUrl.replace(/\/$/, '');
                                                        const path = imgSrc.replace(/^\//, '');
                                                        imgSrc = `${baseUrl}/${path}`;
                                                    }

                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleChoiceSelection(choice)}
                                                            className="flex items-center gap-4 p-4 bg-neutral-900 hover:bg-black border border-neutral-600 hover:border-purple-500 rounded-lg text-left transition-all group"
                                                        >
                                                            <div className="w-10 h-10 flex-shrink-0 bg-neutral-800 rounded border border-neutral-700 flex items-center justify-center group-hover:border-purple-500">
                                                                <img src={imgSrc} className="w-8 h-8 filter invert" alt="" />
                                                            </div>
                                                            <div className="font-bold text-purple-100 group-hover:text-purple-400">{choice.name}</div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleRollBoon}
                                            className="w-full py-4 bg-purple-900 text-purple-200 font-bold uppercase tracking-widest hover:bg-purple-950 transition-colors rounded shadow-lg flex items-center justify-center gap-2"
                                        >
                                            <span className="fas fa-dice-d20"></span> Roll Boon
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {rolledBoons.map((b, idx) => (
                                        <div key={idx} className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-start animate-in fade-in slide-in-from-bottom-2">
                                            <div className="bg-purple-900 text-white w-10 h-10 flex items-center justify-center font-bold text-xl rounded">B</div>
                                            <div>
                                                <div className="font-bold text-lg">{b.name}</div>
                                                <p className="text-sm text-neutral-600 mt-1" dangerouslySetInnerHTML={{ __html: b.description }}></p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}




                    {/* Spells Section */}
                    {isSpellcaster && spellsKnown > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                <h3 className="font-bold text-lg font-serif">Spells (Choose {spellsKnown})</h3>
                                <span className="font-bold text-sm text-neutral-600">{selectedSpells.length} / {spellsKnown}</span>
                            </div>

                            {availableSpells.length === 0 ? (
                                <p className="text-neutral-500 italic">No spells found for this class.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {availableSpells.map(spell => {
                                        const isSelected = !!selectedSpells.find(s => s.uuid === spell.uuid);
                                        return (
                                            <button
                                                key={spell.uuid}
                                                onClick={() => toggleSpell(spell)}
                                                className={`p-3 rounded border text-left transition-all flex items-center justify-between ${isSelected ? 'bg-amber-100 border-amber-600 shadow-md ring-1 ring-amber-500' : 'bg-white border-neutral-200 hover:border-black'}`}
                                            >
                                                <span className="font-bold text-sm">{spell.name}</span>
                                                {isSelected && <span className="fas fa-check text-amber-600"></span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-neutral-200 border-t border-neutral-300 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-neutral-600 font-bold hover:text-black">Cancel</button>
                    <button
                        onClick={handleConfirm}
                        disabled={!isComplete() || loading}
                        className="px-6 py-2 bg-amber-600 text-white font-bold rounded shadow hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Confirm & Create
                    </button>
                </div>
            </div>
        </div>

    );
};
