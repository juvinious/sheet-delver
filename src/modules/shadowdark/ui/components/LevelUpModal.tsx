'use client';

import { useState, useEffect } from 'react';

interface Props {
    actorId: string;
    currentLevel: number;
    targetLevel: number;
    ancestry: any;
    classObj: any;
    classUuid: string;
    patron?: any;
    abilities: any;
    spells: any[];
    availableClasses?: any[];
    availableLanguages?: any[];
    onComplete: (data: { items: any[], hpRoll: number, gold?: number }) => void;
    onCancel: () => void;
    foundryUrl?: string;
}

const simpleRoll = (formula: string): number => {
    try {
        // Basic support for XdY+Z
        const match = formula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
        if (!match) {
            const num = parseInt(formula);
            return isNaN(num) ? 0 : num;
        }
        const [_, countStr, dieStr, op, modStr] = match; // eslint-disable-line @typescript-eslint/no-unused-vars
        const count = parseInt(countStr);
        const die = parseInt(dieStr);
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += Math.floor(Math.random() * die) + 1;
        }
        if (op && modStr) {
            const mod = parseInt(modStr);
            total = op === '+' ? total + mod : total - mod;
        }
        return total;
    } catch (e) {
        console.error("SimpleRoll Error", e);
        return 0;
    }
};



export const LevelUpModal = ({
    actorId,
    currentLevel,
    targetLevel,
    ancestry,
    classObj,
    classUuid,
    patron,
    abilities: _abilities,
    spells,
    availableClasses = [],
    availableLanguages = [],
    onComplete,
    onCancel,
    foundryUrl = ""
}: Props) => {
    // const [step, setStep] = useState<'talents' | 'spells'>('talents'); // Unused
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmReroll, setConfirmReroll] = useState(false);

    // Class Switching State (Level 0 -> 1)
    const [targetClassUuid, setTargetClassUuid] = useState(""); // Start with no selection
    const [activeClassObj, setActiveClassObj] = useState<any>(classObj);
    const [selectedPatronUuid, setSelectedPatronUuid] = useState<string>("");
    const [availablePatrons, setAvailablePatrons] = useState<any[]>([]);
    const [loadingPatrons, setLoadingPatrons] = useState(false);

    // Language Selection State
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]); // UUIDs of selected
    const [fixedLanguages, setFixedLanguages] = useState<string[]>([]); // UUIDs of fixed
    const [knownLanguages, setKnownLanguages] = useState<any[]>([]); // Objects of existing languages


    interface LanguageGroup {
        id: string; // 'select' | 'common' | 'rare'
        label: string;
        count: number;
        options?: string[]; // If restricted options
    }
    const [languageGroups, setLanguageGroups] = useState<LanguageGroup[]>([]);

    // Data
    const [talentTable, setTalentTable] = useState<any>(null);
    const [boonTable, setBoonTable] = useState<any>(null);
    const [spellsKnown, setSpellsKnown] = useState<any>(null);
    const [availableSpells, setAvailableSpells] = useState<any[]>([]);

    // State
    const [hpRoll, setHpRoll] = useState<number>(0);
    const [hpEditMode, setHpEditMode] = useState(false);
    const [goldRoll, setGoldRoll] = useState<number>(0);
    const [goldEditMode, setGoldEditMode] = useState(false);
    const [rolledTalents, setRolledTalents] = useState<any[]>([]);
    const [rolledBoons, setRolledBoons] = useState<any[]>([]);
    const [selectedSpells, setSelectedSpells] = useState<any[]>([]);
    const [pendingChoices, setPendingChoices] = useState<{ header: string, options: any[], context: 'talent' | 'boon' } | null>(null);
    const [spellsToChoose, setSpellsToChoose] = useState<Record<number, number>>({});
    const [spellsToChooseTotal, setSpellsToChooseTotal] = useState(0);

    // Spellcasting
    // Initial guess from props, but API is authoritative
    const [isSpellcaster, setIsSpellcaster] = useState(Boolean(classObj?.system?.spellcasting?.class || classObj?.system?.spellcasting?.ability));

    // Computed Requirements
    // Talent logic: Odd levels = 1 talent. Level 1 + "Ambitious" (Human) = +1 talent.
    const isOddLevel = targetLevel % 2 !== 0; // ... existing ...
    const hasAmbitious = targetLevel === 1 && ancestry?.items?.find((i: any) => i.name === "Ambitious") || false;



    const [requiredTalents, setRequiredTalents] = useState(0);
    const [needsBoon, setNeedsBoon] = useState(Boolean(classObj?.system?.patron?.required));
    const [startingBoons, setStartingBoons] = useState((targetLevel === 1 && classObj?.system?.patron?.required && classObj?.system?.patron?.startingBoons) || 0);

    // Requirements Check
    const isComplete = () => {
        const hpMet = hpRoll > 0;
        const talentMet = rolledTalents.length >= (requiredTalents || 0);
        const boonMet = !needsBoon || rolledBoons.length >= 0 + (startingBoons ? startingBoons : 0) + (rolledBoons.length > 0 ? 0 : 0);
        // Logic for boons is tricky. "Roll Boon" is usually 1. Starting boons are auto-added? 
        // Reference LevelUpSD: checks `!(this.data.talentGained && this.data.talents.length < 1)`.
        // It implies minimal 1 if gained.
        // For boons: `LevelUpSD` doesn't explicitly block on Boons? 
        // It treats Boons as Talents in the `talents` array?
        // `_onRollBoon`: sets rolls.boon = true.
        // `_onRollTalent`: sets rolls.talent = true.
        // The check line 330: `case !(this.data.talentGained && this.data.talents.length < 1):`
        // If `talentGained` is true, we need at least 1 item in `talents`.
        // Boons are pushed to `this.data.talents` in `_onDropTalent`? No, boons usually come from table results.

        // Let's stick to our `rolledTalents` array.
        // If `requiredTalents > 0`, we need that many.


        // Check Languages
        const totalRequired = languageGroups.reduce((a, b) => a + b.count, 0);
        if (selectedLanguages.length < totalRequired) return false; // Simple count check for now

        let spellsMet = true;
        if (isSpellcaster && spellsToChooseTotal > 0) {
            // Check if we have selected enough spells for EACH tier?
            // Or just total? Reference iterates tiers.
            spellsMet = selectedSpells.length >= spellsToChooseTotal;
            // Refinement: Check bounds per tier.
            for (const [tier, count] of Object.entries(spellsToChoose)) {
                const selectedInTier = selectedSpells.filter(s => {
                    const t = s.tier ?? s.system?.tier ?? 0;
                    return Number(t) === Number(tier);
                }).length;
                if (selectedInTier < count) spellsMet = false;
            }
        }

        return hpMet && talentMet && boonMet && spellsMet;
    };

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
            if (typeof table === 'string') {
                tableObj = await fetchDocument(table);
            }
        }

        if (!tableObj) {
            console.error('LevelUpModal: Failed to fetch table document', table);
            return null; // Should return null to propagate error state
        }



        // Handle both EmbeddedCollection (common in Foundry) and Array
        const rawResults = tableObj.results || tableObj.system?.results;

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


        let matchingResults = results.filter(r => {
            const range = r.range || [1, 1]; // Default to 1-1 if missing
            return roll >= range[0] && roll <= range[1];
        });

        // Filter out "structural" text results (like "Choose 1") IF we have other real results
        // User Logic: "The modal selection should be a box with a header using the Unknown Option's description"
        // The "Unknown Option" is the one with empty Name (or specific ID) and drawn=false.

        let headerText = "Choose One";
        let validOptions = matchingResults;

        // Create cleaner list by filtering out structural elements
        if (matchingResults.length > 1) {
            // Attempt to find a "Header" result to use for the title
            const headerResult = matchingResults.find(r =>
                (r.type === 'text' || r.type === 0) &&
                (r.text || r.name || r.description || "").toLowerCase().includes("choose") &&
                r.drawn === false
            );

            if (headerResult) {
                const rawText = headerResult.description || headerResult.text || headerResult.name || "Choose One";
                // Clean up header text "Choose 1" -> "Choose One"
                headerText = (rawText.toLowerCase() === 'choose 1' || rawText.toLowerCase() === 'choose one')
                    ? "Choose One"
                    : rawText;
            }

            // aggressive filtering to remove purely structural items from the OPTIONS list
            validOptions = matchingResults.filter(r => {
                // Always keep Documents (items, spells, etc)
                if (r.documentId || r.documentUuid) return true;

                const text = (r.text || r.name || r.description || "").trim().toLowerCase();

                // Remove results that are just "choose 1", "choose one", or "or"
                if (text === 'choose 1' || text === 'choose one' || text === 'or') return false;

                // Remove empty results
                if (!text) return false;

                // Keep other text results (like "Distribute to Stats", "Roll two boons", etc)
                return true;
            });
        }



        // CASE 1: Multiple Results -> User Choice
        if (validOptions.length > 1) {
            // Need to present choice.
            const choices = validOptions.map(r => ({
                name: r.text || r.name || r.description || "Unknown Option",
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
        // SPECIAL HANDLING: Warlock "Roll two Patron Boons"
        const textContent = (result.text || result.name || result.description || "").toLowerCase();
        if (textContent.includes("roll two patron boons") && textContent.includes("choose one")) {
            if (boonTable) {
                setLoading(true);
                // Roll twice on the boon table
                const roll1 = await fetchTableResult(boonTable, 'boon');
                const roll2 = await fetchTableResult(boonTable, 'boon');

                const options: any[] = [];
                if (roll1 && roll1[0]) options.push(roll1[0]);
                if (roll2 && roll2[0]) options.push(roll2[0]);

                if (options.length > 0) {
                    setPendingChoices({
                        header: "Choose One Boon",
                        options: options.map(o => ({
                            name: o.name,
                            img: o.img,
                            original: o // Pass the full object to be processed
                        })),
                        context: 'talent' // It fills the Talent slot
                    });
                    setLoading(false);
                    return null; // Stop processing the "text" result, wait for user choice
                }
                setLoading(false);
            } else {
                console.warn("Warlock Double Boon: No boon table found.");
            }
        } else if (textContent.includes("roll a patron boon")) {
            // SPECIAL HANDLING: Warlock "Roll a Patron Boon" (Single)
            if (boonTable) {
                setLoading(true);
                const roll = await fetchTableResult(boonTable, 'boon');
                if (roll && roll[0]) {
                    setLoading(false);
                    // Recursively process this boon result to ensure it's formatted/fetched correctly
                    // But wait, fetchTableResult already returns processed results?
                    // Yes, fetchTableResult returns an array of processed objects (from processSingleResult recursion if needed)
                    // So we just return it!
                    return roll;
                }
                setLoading(false);
            }
        }

        if (!result.text && !result.name && !result.description) {
            console.warn("LevelUpModal: Table result missing text/name/description", result);
        }

        let finalResult = {
            name: result.text || result.name || result.description || "Unknown Talent",
            type: 'Talent',
            description: result.description || result.text || "",
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



            const doc = await fetchDocument(uuid);

            if (doc) {
                // RECURSION CHECK: If the result is ANOTHER RollTable, roll on it!
                if (doc.type === 'RollTable') {
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
            } else {
                console.warn("LevelUpModal: Failed to find linked document for result", result);
                finalResult.name = result.text || result.name || "Missing Item (Broken Link)";
                finalResult.description = "The item linked to this result could not be found.";
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
            } else {
                console.warn("LevelUpModal: Failed to find linked document (UUID) for result", result);
                finalResult.name = result.text || result.name || "Missing Item (Broken Link)";
                finalResult.description = "The item linked to this result could not be found.";
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
                    setRolledBoons(prev => [...prev, ...res]);
                } else {
                    setRolledTalents(prev => [...prev, ...res]);
                }
            }
        } catch (e) {
            console.error("Selection Error", e);
        }
        setLoading(false);
    };

    // Parse Language Requirements when Class Changes
    useEffect(() => {
        if (!activeClassObj) return;

        console.log("LevelUpModal: Parsing Languages for", activeClassObj.name, activeClassObj);
        const langData = activeClassObj.system?.languages || activeClassObj.languages || {};
        const fixed = langData.fixed || [];
        setFixedLanguages(fixed);

        const groups: LanguageGroup[] = [];

        // 1. Specific Select Options
        if (langData.select > 0) {
            groups.push({
                id: 'select',
                label: 'Languages', // Generic label, or "Select Languages"
                count: langData.select,
                options: langData.selectOptions || []
            });
        }

        // 2. Common Languages
        if (langData.common > 0) {
            groups.push({
                id: 'common',
                label: 'Common Languages',
                count: langData.common
            });
        }

        // 3. Rare Languages
        if (langData.rare > 0) {
            groups.push({
                id: 'rare',
                label: 'Rare Languages',
                count: langData.rare
            });
        }

        setLanguageGroups(groups);
        setSelectedLanguages([]); // Reset manual selections on class change

    }, [activeClassObj]);



    useEffect(() => {
        fetchLevelUpData();
    }, [actorId, targetLevel, classUuid]); // Re-fetch if fundamentals change

    const fetchLevelUpData = async (classUuidOverride?: string) => {
        if (!actorId && !classUuidOverride) {
            return;
        }

        try {
            let url = `/api/modules/shadowdark/actors/${actorId}/level-up/data`;
            if (classUuidOverride) {
                url += `?classId=${encodeURIComponent(classUuidOverride)}`;
            }
            if (!actorId) {
                url = `/api/modules/shadowdark/actors/level-up/data?classId=${encodeURIComponent(classUuidOverride!)}`;
            }

            const res = await fetch(url, { cache: 'no-store' });
            const json = await res.json();

            if (json.success && json.data) {
                const apiData = json.data;
                if (apiData.isSpellcaster !== undefined) {
                    setIsSpellcaster(apiData.isSpellcaster);
                }
                if (apiData.availableSpells) {
                    setAvailableSpells(apiData.availableSpells);
                }
                if (apiData.spellsToChoose) {
                    setSpellsToChoose(apiData.spellsToChoose);
                    const total = Object.values(apiData.spellsToChoose as Record<number, number>).reduce((a, b) => a + b, 0);
                    setSpellsToChooseTotal(total);
                }
            }
        } catch (e) {
            console.error("Failed to fetch level up data", e);
        }
    };

    // Initialize Class Data
    useEffect(() => {
        const init = async () => {
            try {
                // Don't run init if no class is selected yet
                if (!targetClassUuid && currentLevel === 0) {
                    setLoading(false);
                    return;
                }

                setLoading(true);

                // 1. Resolve Class Document (Sync Logic)
                let currentClass = activeClassObj;
                let effectiveClassUuid: string | undefined = targetClassUuid || classUuid; // Use targetClassUuid if set, otherwise fall back to classUuid

                // If target UUID differs from what we have (and is set), fetch it
                if (targetClassUuid && targetClassUuid !== (activeClassObj?.uuid || classUuid)) {
                    effectiveClassUuid = targetClassUuid; // Optimistic assignment
                    try {
                        let fetchUuid = targetClassUuid;
                        // Check if it's a short ID and try to find it in availableClasses to get context
                        const targetClassFromList = availableClasses.find((c: any) => (c.uuid === targetClassUuid) || (c._id === targetClassUuid));
                        if (targetClassFromList) {
                            if (targetClassFromList.pack) fetchUuid = `Compendium.${targetClassFromList.pack}.${targetClassFromList._id}`;
                            else if (!targetClassFromList.uuid && targetClassFromList._id) fetchUuid = `Compendium.shadowdark.classes.${targetClassFromList._id}`;
                        }

                        const cls = await fetchDocument(fetchUuid);
                        if (cls) {
                            currentClass = cls;
                            setActiveClassObj(cls);
                            if (cls.uuid) effectiveClassUuid = cls.uuid;
                        }
                    } catch (e) { console.error("Failed to fetch target class", e); }
                } else if (!activeClassObj && classObj) {
                    // Initial Fallback (New Character)
                    currentClass = classObj;
                    setActiveClassObj(classObj);
                    effectiveClassUuid = classObj.uuid || classUuid;
                } else if (activeClassObj) {
                    // Existing resolved class
                    effectiveClassUuid = activeClassObj.uuid || classUuid;
                }

                // 2. Fetch API Data (Base)
                // Call if we have an actor OR if we have a resolved class UUID
                if (actorId || effectiveClassUuid) {
                    await fetchLevelUpData(effectiveClassUuid);
                }

                // 3. Class Table Setup (using currentClass)
                if (currentClass?.system?.classTalentTable) {
                    setTalentTable(currentClass.system.classTalentTable);
                } else if (effectiveClassUuid) {
                    try {
                        if (!currentClass) {
                            const cls = await fetchDocument(effectiveClassUuid);
                            if (cls?.system?.classTalentTable) setTalentTable(cls.system.classTalentTable);
                        }
                    } catch (e) {
                        console.error("Failed to fetch class fallback", e);
                    }
                }

                // 4. Update Spellcaster Status and Boon Requirements based on New Class
                if (currentClass) {
                    const isCaster = Boolean(currentClass.system?.spellcasting?.class || currentClass.system?.spellcasting?.ability);

                    // Update boon requirements based on the active class
                    const requiresBoon = Boolean(currentClass.system?.patron?.required);
                    setNeedsBoon(requiresBoon);
                    if (targetLevel === 1 && requiresBoon) {
                        setStartingBoons(currentClass.system?.patron?.startingBoons || 0);
                    } else {
                        setStartingBoons(0);
                    }

                    // Fetch boon table from the selected patron (for classes like Warlock)
                    // or from the class's embedded patron UUID
                    const patronUuidToFetch = selectedPatronUuid || currentClass.system?.patron?.uuid;
                    if (requiresBoon && patronUuidToFetch) {
                        try {
                            const fullPatron = await fetchDocument(patronUuidToFetch);
                            if (fullPatron?.system?.boonTable) {
                                setBoonTable(fullPatron.system.boonTable);
                            }
                        } catch (e) {
                            console.error("Failed to fetch patron for class", e);
                        }
                    } else if (requiresBoon && !patronUuidToFetch) {
                        // Warlock needs a patron but none selected yet
                        setBoonTable(null);
                    } else {
                        setBoonTable(null);
                    }
                } else if (patron) {
                    // Fallback to prop-based patron (for existing characters)
                    if (patron.system?.boonTable) {
                        setBoonTable(patron.system.boonTable);
                    } else if (patron.uuid) {
                        try {
                            const fullPatron = await fetchDocument(patron.uuid);
                            if (fullPatron?.system?.boonTable) {
                                setBoonTable(fullPatron.system.boonTable);
                            }
                        } catch (e) {
                            console.error("Failed to fetch full patron", e);
                        }
                    }
                }

                // Fetch Current Languages (Ancestry, etc.)
                if (actorId) {
                    try {
                        const actorDoc = await fetchDocument(`Actor.${actorId}`);
                        if (actorDoc?.items) {
                            const existingLangs = actorDoc.items.filter((i: any) => i.type === 'Language');
                            setKnownLanguages(existingLangs);
                        }
                    } catch (e) { console.error("Failed to fetch actor languages", e); }
                }

                // 5. Requirements (Ambitious etc)
                try {
                    const oddLevelTalent = targetLevel % 2 !== 0 ? 1 : 0;
                    let talentTotal = oddLevelTalent;
                    if (actorId && targetLevel === 1) {
                        const actorDoc = await fetchDocument(`Actor.${actorId}`);
                        if (actorDoc?.items?.find((i: any) => i.name === "Ambitious")) {
                            talentTotal += 1;
                        }
                    }
                    setRequiredTalents(talentTotal);
                } catch (e) {
                    setRequiredTalents(targetLevel % 2 !== 0 ? 1 : 0);
                }
            } catch (error) {
                console.error("Error in LevelUpModal init:", error);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [classObj, patron, actorId, targetLevel, targetClassUuid, selectedPatronUuid]); // Added selectedPatronUuid dependency

    // Fetch available patrons when needsBoon becomes true
    useEffect(() => {
        const fetchPatrons = async () => {
            if (needsBoon && availablePatrons.length === 0) {
                try {
                    setLoadingPatrons(true);
                    const response = await fetch('/api/system/data');
                    const data = await response.json();
                    if (data.patrons) {
                        setAvailablePatrons(data.patrons);
                    }
                } catch (e) {
                    console.error("Failed to fetch patrons", e);
                } finally {
                    setLoadingPatrons(false);
                }
            }
        };
        fetchPatrons();
    }, [needsBoon, availablePatrons.length]);

    // Reset all fields when class selection changes
    useEffect(() => {
        if (targetClassUuid && targetClassUuid !== classUuid) {
            setHpRoll(0);
            setHpEditMode(false);
            setGoldRoll(0);
            setGoldEditMode(false);
            setRolledTalents([]);
            setRolledBoons([]);
            setSelectedSpells([]);
            setPendingChoices(null);
            setSelectedPatronUuid(""); // Reset patron selection when class changes
        }
    }, [targetClassUuid, classUuid]);



    const handleRollTalent = async () => {
        if (!talentTable) {
            setError("No Talent Table found for this class.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetchTableResult(talentTable, 'talent');
            if (res) {
                setRolledTalents(prev => [...prev, ...res]);
            }
        } catch (e: any) {
            console.error('LevelUpModal: Roll Error', e);
            setError("Roll failed: " + e.message);
        }
        setLoading(false);
    };



    const clearPending = () => setPendingChoices(null);

    const handleRollHP = async (isReroll: boolean = false) => {
        if (isReroll && !confirmReroll) {
            setConfirmReroll(true);
            return;
        }
        if (isReroll) setConfirmReroll(false); // Reset after confirm

        setLoading(true);
        setError(null);
        try {
            const url = actorId
                ? `/api/modules/shadowdark/actors/${actorId}/level-up/roll-hp`
                : `/api/modules/shadowdark/actors/level-up/roll-hp`;

            // Use targetClassUuid if set (user selected a new class), otherwise use activeClassObj or fall back to classUuid
            const classId = targetClassUuid || activeClassObj?.uuid || classUuid;


            const body = {
                isReroll,
                classId
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                setHpRoll(data.roll.total);
            } else {
                setError('Failed to roll HP: ' + (data.error || 'Unknown error'));
            }
        } catch (e: any) {
            console.error('HP Roll Error:', e);
            setError('Failed to roll HP: ' + e.message);
        }
        setLoading(false);
    };

    const handleRollGold = async () => {
        setLoading(true);
        setError(null);
        try {
            const url = actorId
                ? `/api/modules/shadowdark/actors/${actorId}/level-up/roll-gold`
                : `/api/modules/shadowdark/actors/level-up/roll-gold`;

            const body = {
                isReroll: true,
                classId: activeClassObj?.uuid || classUuid
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                setGoldRoll(data.roll.total);
            } else {
                setError('Failed to roll Gold: ' + (data.error || 'Unknown error'));
            }
        } catch (e: any) {
            console.error('Gold Roll Error:', e);
            setError('Failed to roll Gold: ' + e.message);
        }
        setLoading(false);
    };

    const handleRollBoon = async () => {
        clearPending();
        let table = boonTable;
        if (!table) {
            console.warn("LevelUpModal: No boon table found for patron");
            setError("The selected Patron does not have a Boon Table defined.");
            return;
        }
        if (!table) return;

        setLoading(true);
        const res = await fetchTableResult(table, 'boon');
        if (res) setRolledBoons(res);
        setLoading(false);
    };

    const handleRollExtraBoon = async () => {
        clearPending();
        let table = boonTable;
        if (!table) {
            console.warn("LevelUpModal: No boon table found for patron");
            setError("The selected Patron does not have a Boon Table defined.");
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
        const items: any[] = [];

        // Helper to resolve results to documents
        const resolveToDocs = async (results: any[]): Promise<any[]> => {
            const resolved: any[] = [];
            for (const r of results) {
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
                // If it's a structural/text result, keep it (Generator regex parsers might use it)
                // But usually we want the Actual Item if it exists.
                const uuid = r.documentUuid || r.documentId || r.uuid;

                if (uuid) {
                    const doc = await fetchDocument(uuid);
                    if (doc) {
                        // Double check if the doc itself is a RollTable
                        if (doc.documentName === 'RollTable' || doc.type === 'RollTable') {
                            const subResults = await fetchTableResult(doc, 'talent');
                            if (subResults && subResults.length > 0) {
                                const subResolved = await resolveToDocs(subResults);
                                resolved.push(...subResolved);
                            }
                        } else {
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

        // Resolve Languages
        const resolvedLanguages: any[] = [];
        if (availableLanguages) {
            // Helper to find lang doc
            const findLang = (uuidOrId: string) => availableLanguages.find((l: any) => l.uuid === uuidOrId || l._id === uuidOrId);

            // 1. Fixed
            for (const fid of fixedLanguages) {
                const lang = findLang(fid);
                if (lang) {
                    // Fetch full doc if needed, but often compendium index is not enough for creation? 
                    // Actually we need to create the item. If availableLanguages contains index data, we might need to fetch full doc.
                    // Assuming availableLanguages has minimal data, let's fetch.
                    const full = await fetchDocument(lang.uuid || fid); // Use uuid if available, else id (with fetch logic)
                    if (full) resolvedLanguages.push({ ...full, type: 'Language' });
                }
            }
            // 2. Selected
            for (const sid of selectedLanguages) {
                const lang = findLang(sid);
                if (lang) {
                    const full = await fetchDocument(lang.uuid || sid);
                    if (full) resolvedLanguages.push({ ...full, type: 'Language' });
                }
            }
        }

        items.push(...resolvedLanguages.map(l => {
            const copy = { ...l };
            delete copy._id;
            return copy;
        }));

        items.push(...resolvedTalents);
        items.push(...resolvedBoons);

        if (selectedSpells.length > 0) {
            const spellPromises = selectedSpells.map(s => fetchDocument(s.uuid));
            const fullSpells = await Promise.all(spellPromises);
            items.push(...fullSpells.filter(s => s));
        }

        // Include New Class if switched OR if it's Level 0 (force update)
        const isLvl0 = Number(currentLevel) === 0;
        console.log("LevelUpModal Class Logic:", {
            active: activeClassObj?.name,
            activeUuid: activeClassObj?.uuid,
            old: classObj?.name,
            oldUuid: classObj?.uuid,
            isLvl0
        });

        if ((activeClassObj && (activeClassObj.uuid || activeClassObj._id) !== (classObj?.uuid || classObj?._id)) || (activeClassObj && isLvl0)) {
            console.log("LevelUpModal: Fetching new class to persist...");
            let fetchUuid = activeClassObj.uuid;
            if (!fetchUuid && activeClassObj._id) {
                if (activeClassObj.pack) fetchUuid = `Compendium.${activeClassObj.pack}.${activeClassObj._id}`;
                else fetchUuid = `Compendium.shadowdark.classes.${activeClassObj._id}`;
            }
            const fullClass = await fetchDocument(fetchUuid);

            if (fullClass) {
                console.log("LevelUpModal: Full Class result:", fullClass.name);
                // Sanitize: Creating a NEW embedded item, so remove _id to avoid conflicts
                // Also explicitly ensure type is 'Class'
                const classItem = { ...fullClass, type: 'Class' };
                delete classItem._id;
                items.push(classItem);
                console.log("LevelUpModal: Added sanitized class item for creation");
            } else {
                console.log("LevelUpModal: Full Class result: NULL");
            }
        }

        // Include Patron if selected (and different)
        if (selectedPatronUuid && selectedPatronUuid !== patron?.uuid) {
            const fullPatron = await fetchDocument(selectedPatronUuid);
            if (fullPatron) items.push(fullPatron);
        }

        const data: any = { items, hpRoll };
        if (goldRoll >= 0) data.gold = goldRoll;

        onComplete(data);
    };

    const toggleSpell = (spell: any) => {
        const spellId = spell.uuid || spell._id;
        const spellTier = spell.tier ?? spell.system?.tier ?? 0;

        const isSelected = selectedSpells.find(s => (s.uuid || s._id) === spellId);

        if (isSelected) {
            setSelectedSpells(prev => prev.filter(s => (s.uuid || s._id) !== spellId));
        } else {
            // Check limits for this tier
            const limit = spellsToChoose[spellTier] || 0;
            const currentSelectedInTier = selectedSpells.filter(s => {
                const t = s.tier ?? s.system?.tier ?? 0;
                return t === spellTier;
            }).length;

            if (currentSelectedInTier < limit) {
                setSelectedSpells(prev => [...prev, spell]);
            }
        }
    };
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-neutral-100 w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-neutral-900 text-white p-4 flex justify-between items-center border-b-4 border-amber-600">
                    <h2 className="text-xl font-serif font-bold tracking-wider">Level Up: Level {targetLevel}</h2>
                </div>



                <div className="flex-1 overflow-y-auto">
                    {/* Class Selection (Level 0 Only) */}
                    {currentLevel === 0 && availableClasses && availableClasses.length > 0 && (
                        <div className="p-4 bg-neutral-200 border-b border-neutral-300 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1">
                                <label className="font-bold text-neutral-700 whitespace-nowrap">Choose Class:</label>
                                <select
                                    className="flex-1 p-2 border border-neutral-400 rounded"
                                    value={targetClassUuid}
                                    onChange={(e) => setTargetClassUuid(e.target.value)}
                                >
                                    <option value="" disabled>Select a Class...</option>
                                    {availableClasses
                                        .filter((c: any) => c.name !== "Level 0")
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((c: any) => (
                                            <option key={c.uuid || c._id} value={c.uuid || c._id}>{c.name}</option>
                                        ))}
                                </select>
                            </div>
                            <button
                                onClick={() => {
                                    const candidates = availableClasses.filter((c: any) => c.name !== "Level 0");
                                    const rand = candidates[Math.floor(Math.random() * candidates.length)];
                                    if (rand) setTargetClassUuid(rand.uuid || rand._id);
                                }}
                                className="px-3 py-2 bg-neutral-800 text-amber-500 hover:text-amber-400 hover:bg-neutral-700 rounded shadow font-bold text-sm transition-colors"
                                title="Randomize Class"
                            >
                                Random
                            </button>
                        </div>
                    )}



                    {/* Patron Selection (for Warlock and other patron-requiring classes) */}
                    {
                        needsBoon && currentLevel === 0 && availablePatrons.length > 0 && (
                            <div className="p-4 bg-neutral-200 border-b border-neutral-300 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <label className="font-bold text-neutral-700 whitespace-nowrap">Choose Patron:</label>
                                    <select
                                        className="flex-1 p-2 border border-neutral-400 rounded"
                                        value={selectedPatronUuid}
                                        onChange={(e) => setSelectedPatronUuid(e.target.value)}
                                    >
                                        <option value="" disabled>Select a Patron...</option>
                                        {availablePatrons
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map((p: any) => (
                                                <option key={p.uuid} value={p.uuid}>{p.name}</option>
                                            ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        const rand = availablePatrons[Math.floor(Math.random() * availablePatrons.length)];
                                        if (rand) setSelectedPatronUuid(rand.uuid);
                                    }}
                                    className="px-3 py-2 bg-neutral-800 text-amber-500 hover:text-amber-400 hover:bg-neutral-700 rounded shadow font-bold text-sm transition-colors"
                                    title="Randomize Patron"
                                >
                                    Random
                                </button>
                            </div>
                        )
                    }

                    {
                        loading || loadingPatrons ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                                <div className="w-12 h-12 border-4 border-neutral-300 border-t-amber-600 rounded-full animate-spin"></div>
                                <p className="text-neutral-500 font-bold tracking-wide animate-pulse">Consulting the fates...</p>
                            </div>
                        ) : (
                            <div className="p-6 overflow-y-auto space-y-8 flex-1 relative">
                                {/* HP Roll Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                        <h3 className="font-bold text-lg font-serif">Hit Points</h3>
                                        {hpRoll > 0 && <span className="text-green-600 font-bold text-sm">Rolled!</span>}
                                    </div>

                                    {hpRoll === 0 ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="bg-neutral-50 p-4 rounded border border-neutral-200">
                                                <p className="text-sm text-neutral-600 mb-2">
                                                    Roll <span className="font-bold text-black">{activeClassObj?.system?.hitPoints || '1d4'}</span> for hit points
                                                    {targetLevel === 1 && <span className="text-amber-600"> (+ CON modifier)</span>}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => handleRollHP(false)}
                                                    className="py-4 bg-red-900 text-red-100 font-bold uppercase tracking-widest hover:bg-red-950 transition-colors rounded shadow-lg flex items-center justify-center gap-2"
                                                >
                                                    <span className="fas fa-dice-d20"></span> Roll HP
                                                </button>
                                                <button
                                                    onClick={() => { setHpRoll(1); setHpEditMode(true); }}
                                                    className="py-4 bg-white text-neutral-700 border border-neutral-300 font-bold uppercase tracking-widest hover:bg-neutral-50 transition-colors rounded shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    <span className="fas fa-edit"></span> Manual Input
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2">
                                            <div className="bg-red-900 text-white w-20 h-20 flex items-center justify-center font-bold text-3xl rounded shrink-0">
                                                {hpEditMode ? (
                                                    <input
                                                        type="number"
                                                        value={hpRoll}
                                                        onChange={(e) => setHpRoll(parseInt(e.target.value) || 0)}
                                                        className="w-full h-full text-center bg-transparent border-none outline-none text-white placeholder-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        min="1"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    hpRoll
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-lg truncate">
                                                    HP Rolled: {hpRoll}
                                                    {targetLevel === 1 && (
                                                        <span className="text-neutral-500 font-normal ml-1">
                                                            + {(_abilities?.con?.mod || 0)} (CON) = <span className="text-black font-bold">{Math.max(1, hpRoll + (_abilities?.con?.mod || 0))}</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-neutral-600 mt-1 truncate">
                                                    {activeClassObj?.system?.hitPoints || '1d4'}
                                                    {targetLevel === 1 && ` + CON modifier (minimum 1)`}
                                                </p>
                                            </div>
                                            <div className="flex gap-2 flex-col sm:flex-row relative">
                                                <button
                                                    onClick={() => setHpEditMode(!hpEditMode)}
                                                    className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600"
                                                >
                                                    {hpEditMode ? 'Done' : 'Edit'}
                                                </button>

                                                {confirmReroll ? (
                                                    <div className="absolute top-full right-0 mt-2 bg-white border-2 border-red-500 rounded p-2 shadow-xl z-10 w-48 text-center animate-in zoom-in-95 duration-200">
                                                        <p className="text-xs font-bold text-red-600 mb-2">Re-roll HP?</p>
                                                        <div className="flex gap-2 justify-center">
                                                            <button onClick={() => setConfirmReroll(false)} className="px-2 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded">No</button>
                                                            <button onClick={() => handleRollHP(true)} className="px-2 py-1 text-xs bg-red-600 text-white hover:bg-red-700 rounded font-bold">Yes</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => handleRollHP(true)}
                                                            className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold"
                                                        >
                                                            Re-roll
                                                        </button>
                                                        <button
                                                            onClick={() => { setHpRoll(0); setHpEditMode(false); }}
                                                            className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600"
                                                        >
                                                            Clear
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}


                                    {/* Inline Error Display */}
                                    {error && (
                                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative animate-in fade-in slide-in-from-top-2" role="alert">
                                            <strong className="font-bold">Error: </strong>
                                            <span className="block sm:inline">{error}</span>
                                            <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                                                <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" /></svg>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Gold Roll Section (Only for Level 1) */}
                                {targetLevel === 1 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                            <h3 className="font-bold text-lg font-serif">Starting Gold</h3>
                                            {goldRoll > 0 && <span className="text-green-600 font-bold text-sm">Rolled!</span>}
                                        </div>

                                        {goldRoll === 0 ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="bg-neutral-50 p-4 rounded border border-neutral-200">
                                                    <p className="text-sm text-neutral-600 mb-2">
                                                        Roll <span className="font-bold text-black">2d6 x 5</span> for starting gold.
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={handleRollGold}
                                                        className="py-4 bg-amber-600 text-white font-bold uppercase tracking-widest hover:bg-amber-700 transition-colors rounded shadow-lg flex items-center justify-center gap-2"
                                                    >
                                                        <span className="fas fa-coins"></span> Roll Gold
                                                    </button>
                                                    <button
                                                        onClick={() => { setGoldRoll(10); setGoldEditMode(true); }} // Default placeholder?
                                                        className="py-4 bg-white text-neutral-700 border border-neutral-300 font-bold uppercase tracking-widest hover:bg-neutral-50 transition-colors rounded shadow-sm flex items-center justify-center gap-2"
                                                    >
                                                        <span className="fas fa-edit"></span> Manual Input
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2">
                                                <div className="bg-amber-400 text-black w-20 h-20 flex items-center justify-center font-bold text-3xl rounded shrink-0 ring-4 ring-amber-200">
                                                    {goldEditMode ? (
                                                        <input
                                                            type="number"
                                                            value={goldRoll}
                                                            onChange={(e) => setGoldRoll(parseInt(e.target.value) || 0)}
                                                            className="w-full h-full text-center bg-transparent border-none outline-none text-black placeholder-black/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            min="0"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            {goldRoll} <span className="text-[10px] uppercase font-bold text-amber-900/50">GP</span>
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-lg truncate flex items-center gap-2">
                                                        Starting Gold: {goldRoll} gp
                                                    </div>
                                                    <p className="text-sm text-neutral-600 mt-1 truncate">
                                                        Standard: 2d6 x 5
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 flex-col sm:flex-row relative">
                                                    <button
                                                        onClick={() => setGoldEditMode(!goldEditMode)}
                                                        className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600"
                                                    >
                                                        {goldEditMode ? 'Done' : 'Edit'}
                                                    </button>
                                                    <button
                                                        onClick={handleRollGold}
                                                        className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold"
                                                    >
                                                        Re-roll
                                                    </button>
                                                    <button
                                                        onClick={() => { setGoldRoll(0); setGoldEditMode(false); }}
                                                        className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Talents / Benefits Section */}
                                {requiredTalents > 0 ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                            <h3 className="font-bold text-lg font-serif">Level Benefit</h3>
                                            <div className="flex gap-2">
                                                <span className="text-sm">Needed: {requiredTalents}</span>
                                                {rolledTalents.length >= requiredTalents && <span className="text-green-600 font-bold text-sm">Selected!</span>}
                                            </div>
                                        </div>


                                        {/* Show rolled talents if any */}
                                        {rolledTalents.length > 0 && (
                                            <div className="space-y-2 mb-4">
                                                {rolledTalents.map((t, idx) => (
                                                    <div key={idx} className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2">
                                                        <div className="bg-neutral-900 text-white w-10 h-10 flex items-center justify-center font-bold text-xl rounded shrink-0">
                                                            {t.type === 'Talent' ? 'T' : 'B'}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-lg truncate">{t.name}</div>
                                                            <p className="text-sm text-neutral-600 mt-1 truncate" dangerouslySetInnerHTML={{ __html: t.description }}></p>
                                                        </div>
                                                        <div className="flex gap-2 shrink-0">
                                                            <button
                                                                onClick={() => {
                                                                    const newTalents = [...rolledTalents];
                                                                    newTalents.splice(idx, 1);
                                                                    setRolledTalents(newTalents);
                                                                    handleRollTalent();
                                                                }}
                                                                className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold transition-colors"
                                                            >
                                                                Re-roll
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newTalents = [...rolledTalents];
                                                                    newTalents.splice(idx, 1);
                                                                    setRolledTalents(newTalents);
                                                                }}
                                                                className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600 transition-colors"
                                                            >
                                                                Clear
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Show roll button if not all talents rolled yet */}
                                        {rolledTalents.length < requiredTalents && (
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
                                                        {/* Only show OR choice for Level 2+ */}
                                                        {needsBoon && targetLevel > 1 && (
                                                            <>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="h-px bg-neutral-300 flex-1"></div>
                                                                    <span className="text-neutral-500 text-xs uppercase font-bold">OR</span>
                                                                    <div className="h-px bg-neutral-300 flex-1"></div>
                                                                </div>
                                                                <button
                                                                    onClick={handleRollExtraBoon}
                                                                    className="w-full py-3 bg-purple-100 text-purple-900 border-2 border-purple-200 font-bold uppercase tracking-widest hover:bg-purple-200 transition-colors rounded shadow flex items-center justify-center gap-2"
                                                                >
                                                                    <span className="fas fa-star"></span> Choose Patron Boon
                                                                </button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                            <h3 className="font-bold text-lg font-serif text-neutral-400">Level Benefit</h3>
                                        </div>
                                        <div className="p-4 bg-neutral-100 border border-neutral-200 rounded text-neutral-500 italic text-center text-sm">
                                            No Talent gained at Level {targetLevel}.
                                        </div>
                                    </div>
                                )}

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
                                                    <>
                                                        {!selectedPatronUuid && !boonTable ? (
                                                            <div className="bg-amber-50 border-2 border-amber-400 rounded p-4 text-center">
                                                                <p className="text-amber-800 font-bold">
                                                                    <span className="fas fa-exclamation-triangle mr-2"></span>
                                                                    Select a patron above to roll boons
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={handleRollBoon}
                                                                className="w-full py-4 bg-purple-900 text-purple-200 font-bold uppercase tracking-widest hover:bg-purple-950 transition-colors rounded shadow-lg flex items-center justify-center gap-2"
                                                            >
                                                                <span className="fas fa-dice-d20"></span> Roll Boon
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {rolledBoons.map((b, idx) => (
                                                    <div key={idx} className="bg-white p-4 border border-neutral-300 rounded shadow-sm flex gap-4 items-center animate-in fade-in slide-in-from-bottom-2">
                                                        <div className="bg-purple-900 text-white w-10 h-10 flex items-center justify-center font-bold text-xl rounded shrink-0">B</div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-lg truncate">{b.name}</div>
                                                            <p className="text-sm text-neutral-600 mt-1 truncate" dangerouslySetInnerHTML={{ __html: b.description }}></p>
                                                        </div>
                                                        <div className="flex gap-2 shrink-0">
                                                            <button
                                                                onClick={() => handleRollBoon()}
                                                                className="px-3 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-bold transition-colors"
                                                            >
                                                                Re-roll
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newBoons = [...rolledBoons];
                                                                    newBoons.splice(idx, 1);
                                                                    setRolledBoons(newBoons);
                                                                }}
                                                                className="px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300 rounded font-bold text-neutral-600 transition-colors"
                                                            >
                                                                Clear
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}




                                {/* Language Selection (Moved) */}
                                {activeClassObj && (languageGroups.length > 0 || fixedLanguages.length > 0) && (
                                    <div className="p-4 bg-white border border-neutral-300 rounded shadow-sm space-y-4">
                                        <div className="flex justify-between items-center border-b pb-2">
                                            <h3 className="font-bold text-neutral-800 flex items-center gap-2 text-lg font-serif">
                                                <span className="fas fa-language"></span> Select Languages
                                            </h3>
                                            <button onClick={() => setSelectedLanguages([])} className="text-xs text-neutral-500 hover:text-red-600 underline">Clear All</button>
                                        </div>

                                        {/* Known Languages (Ancestry/Previous) */}
                                        {knownLanguages.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Known Languages</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {knownLanguages.map((lang: any) => (
                                                        <span key={lang._id || lang.uuid} className="px-3 py-1 bg-neutral-100 text-neutral-500 rounded text-sm font-bold border border-neutral-200 flex items-center gap-1 cursor-default" title="Already Known">
                                                            {lang.name}
                                                            <span className="fas fa-check text-xs text-neutral-400"></span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Fixed Languages */}
                                        {fixedLanguages.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Fixed Languages</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {fixedLanguages.map(fid => {
                                                        const lang = availableLanguages?.find((l: any) => l.uuid === fid || l._id === fid);
                                                        return (
                                                            <span key={fid} className="px-3 py-1 bg-neutral-200 text-neutral-700 rounded text-sm font-bold border border-neutral-300">
                                                                {lang?.name || "Unknown Language"}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Rendering Groups */}
                                        {languageGroups.map((group) => {
                                            const currentCount = selectedLanguages.filter(lid => {
                                                const lang = availableLanguages?.find((l: any) => l.uuid === lid || l._id === lid);
                                                if (!lang) return false;
                                                if (group.id === 'select') return group.options?.includes(lid);
                                                if (group.id === 'common') return lang.system?.rarity === 'common' || lang.system?.rarity === undefined;
                                                if (group.id === 'rare') return lang.system?.rarity === 'rare';
                                                return false;
                                            }).length;

                                            const groupOptions = availableLanguages?.filter((l: any) => {
                                                const id = l.uuid || l._id;
                                                const name = l.name;
                                                // Exclude if already fixed
                                                if (fixedLanguages.includes(id)) return false;
                                                // Exclude if already known (check by name as ID might differ if item vs compendium)
                                                if (knownLanguages.some(k => k.name?.toLowerCase() === name?.toLowerCase())) return false;

                                                if (group.id === 'select') return group.options?.includes(id);
                                                if (group.id === 'common') return l.system?.rarity === 'common';
                                                if (group.id === 'rare') return l.system?.rarity === 'rare';
                                                return false;
                                            }) || [];

                                            const groupSelections = selectedLanguages.filter(lid => groupOptions.some((o: any) => (o.uuid || o._id) === lid));
                                            const countSelected = groupSelections.length;

                                            return (
                                                <div key={group.id} className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
                                                            {group.label}
                                                        </span>
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${countSelected === group.count ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {countSelected} / {group.count}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-neutral-200 rounded bg-neutral-50">
                                                        {groupOptions
                                                            .sort((a: any, b: any) => a.name.localeCompare(b.name))
                                                            .map((l: any) => {
                                                                const id = l.uuid || l._id;
                                                                const isSelected = selectedLanguages.includes(id);
                                                                const reachedLimit = countSelected >= group.count;
                                                                const disabled = !isSelected && reachedLimit;

                                                                return (
                                                                    <label key={id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-white transition-colors ${isSelected ? 'bg-amber-100 border-amber-400' : 'bg-white border-neutral-200'}`}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            disabled={disabled}
                                                                            onChange={() => {
                                                                                if (isSelected) {
                                                                                    setSelectedLanguages(prev => prev.filter(x => x !== id));
                                                                                } else {
                                                                                    setSelectedLanguages(prev => [...prev, id]);
                                                                                }
                                                                            }}
                                                                            className="accent-amber-600 w-4 h-4"
                                                                        />
                                                                        <span className={`text-sm ${isSelected ? 'font-bold text-black' : 'text-neutral-700'} ${disabled ? 'opacity-50' : ''}`}>{l.name}</span>
                                                                    </label>
                                                                )
                                                            })
                                                        }
                                                        {groupOptions.length === 0 && <span className="col-span-2 text-sm text-neutral-400 italic p-2">No languages available for this category.</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Spells Section */}
                                {isSpellcaster && spellsToChooseTotal > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b-2 border-neutral-300 pb-2">
                                            <h3 className="font-bold text-lg font-serif">Spells</h3>
                                            <div className="flex gap-2">
                                                {Object.entries(spellsToChoose).map(([tier, count]) => {
                                                    const currentCount = selectedSpells.filter(s => {
                                                        const t = s.tier ?? s.system?.tier ?? 0;
                                                        return Number(t) === Number(tier);
                                                    }).length;
                                                    return (
                                                        <span key={tier} className="text-xs bg-neutral-200 px-2 py-1 rounded">
                                                            Tier {tier}: {currentCount}/{count}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {Object.entries(spellsToChoose).map(([tierStr, count]) => {
                                                const tier = Number(tierStr);
                                                const spellsInTier = availableSpells.filter(s => {
                                                    const sTier = s.tier ?? s.system?.tier ?? 0;
                                                    return Number(sTier) === tier;
                                                });

                                                if (spellsInTier.length === 0) return null;

                                                return (
                                                    <div key={tier} className="col-span-full">
                                                        <h4 className="text-xs font-bold uppercase text-neutral-500 mb-1">Tier {tier} Options (Choose {count})</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {spellsInTier.map(spell => {
                                                                const spellId = spell.uuid || spell._id;
                                                                const isSelected = !!selectedSpells.find(s => (s.uuid || s._id) === spellId);
                                                                const isKnown = spells.some(s => s.name === spell.name);

                                                                const selectedCountInTier = selectedSpells.filter(s => {
                                                                    const t = s.tier ?? s.system?.tier ?? 0;
                                                                    return Number(t) === tier;
                                                                }).length;

                                                                const disabled = isKnown || (!isSelected && selectedCountInTier >= count);

                                                                return (
                                                                    <button
                                                                        key={spellId}
                                                                        onClick={() => !isKnown && toggleSpell(spell)}
                                                                        disabled={disabled}
                                                                        className={`p-3 rounded border text-left transition-all flex items-center justify-between ${isKnown ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed border-neutral-200' :
                                                                            isSelected ? 'bg-amber-100 border-amber-600 shadow-md ring-1 ring-amber-500' :
                                                                                'bg-white border-neutral-200 hover:border-black'
                                                                            } ${!isKnown && disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        <span className="font-bold text-sm flex items-center gap-2">
                                                                            {spell.name}
                                                                            {isKnown && <span className="text-[10px] uppercase bg-neutral-200 text-neutral-500 px-1 rounded">Known</span>}
                                                                        </span>
                                                                        {isSelected && <span className="fas fa-check text-amber-600"></span>}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    }

                </div>

                <div className="p-4 bg-neutral-200 border-t border-neutral-300 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-neutral-600 font-bold hover:text-black">Cancel</button>
                    <button
                        onClick={handleConfirm}
                        disabled={!isComplete() || loading}
                        className="px-6 py-2 bg-amber-600 text-white font-bold rounded shadow hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        Level Up!
                    </button>
                </div>
            </div>
        </div>
    );
};
