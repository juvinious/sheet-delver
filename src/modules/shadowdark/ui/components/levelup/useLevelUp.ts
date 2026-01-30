import { useState, useEffect, useCallback, useMemo } from 'react';
import { resolveGear } from './resolveGear';
import { TALENT_HANDLERS } from './talent-handlers';
import { findEffectUuid } from '../../../data/talent-effects';

export interface LevelUpProps {
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
    onComplete: (data: { items: any[], hpRoll: number, gold?: number, languages?: string[] }) => void;
    onCancel: () => void;
    foundryUrl?: string;
    actorName?: string;
    patronUuid?: string;
}

export type SectionStatus = 'IDLE' | 'LOADING' | 'READY' | 'ERROR' | 'COMPLETE' | 'DISABLED';


export const useLevelUp = (props: LevelUpProps) => {
    const {
        actorId,
        currentLevel,
        targetLevel,
        ancestry,
        classObj,
        classUuid,
        patron,
        patronUuid,
        abilities: _abilities,
        availableClasses = [],
        availableLanguages = [],
        onComplete,
    } = props;

    const [statuses, setStatuses] = useState<Record<string, SectionStatus>>({
        class: 'LOADING',
        extraSpells: 'IDLE',
        patron: 'DISABLED',
        hp: 'IDLE',
        gold: 'IDLE',
        talents: 'IDLE',
        boons: 'DISABLED',
        spells: 'DISABLED',
        languages: 'DISABLED'
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [confirmReroll, setConfirmReroll] = useState(false);

    const [targetClassUuid, setTargetClassUuid] = useState("");
    const [activeClassObj, setActiveClassObj] = useState<any>(classObj);
    const [selectedPatronUuid, setSelectedPatronUuid] = useState<string>("");
    const [fetchedPatron, setFetchedPatron] = useState<any>(null);
    const [availablePatrons, setAvailablePatrons] = useState<any[]>([]);
    const [loadingPatrons, setLoadingPatrons] = useState(false);

    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
    const [fixedLanguages, setFixedLanguages] = useState<string[]>([]);
    const [knownLanguages, setKnownLanguages] = useState<any[]>([]);
    const [languageGroups, setLanguageGroups] = useState<any[]>([]);

    const [talentTable, setTalentTable] = useState<any>(null);
    const [boonTable, setBoonTable] = useState<any>(null);
    const [availableSpells, setAvailableSpells] = useState<any[]>([]);

    const [hpRoll, setHpRoll] = useState<number>(0);
    const [goldRoll, setGoldRoll] = useState<number>(0);
    const [rolledTalents, setRolledTalents] = useState<any[]>([]);
    const [rolledBoons, setRolledBoons] = useState<any[]>([]);
    const [selectedSpells, setSelectedSpells] = useState<any[]>([]);
    const [pendingChoices, setPendingChoices] = useState<any>(null);

    const [spellsToChoose, setSpellsToChoose] = useState<Record<number, number>>({});
    const [spellsToChooseTotal, setSpellsToChooseTotal] = useState(0);
    const [existingItems, setExistingItems] = useState<any[]>([]);
    const [statSelection, setStatSelection] = useState<{ required: number; selected: string[] }>({ required: 0, selected: [] });
    const [weaponMasterySelection, setWeaponMasterySelection] = useState<{ required: number; selected: string[] }>({ required: 0, selected: [] });
    const [armorMasterySelection, setArmorMasterySelection] = useState<{ required: number; selected: string[] }>({ required: 0, selected: [] });
    const [extraSpellSelection, setExtraSpellSelection] = useState<{ active: boolean; maxTier: number; source: string; selected: any[] }>({ active: false, maxTier: 0, source: 'Wizard', selected: [] });
    const [extraSpellsList, setExtraSpellsList] = useState<any[]>([]);

    const [isSpellcaster, setIsSpellcaster] = useState(Boolean(classObj?.system?.spellcasting?.class || classObj?.system?.spellcasting?.ability));
    const [requiredTalents, setRequiredTalents] = useState(0);
    const [needsBoon, setNeedsBoon] = useState(Boolean(classObj?.system?.patron?.required));
    const [startingBoons, setStartingBoons] = useState(0);
    const [choiceRolls, setChoiceRolls] = useState(0);

    const simpleRoll = useCallback((formula: string): number => {
        try {
            const match = formula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
            if (!match) {
                const num = parseInt(formula);
                return isNaN(num) ? 0 : num;
            }
            const [_, countStr, dieStr, op, modStr] = match;
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
    }, []);

    const fetchDocument = useCallback(async (uuid: string) => {
        try {
            const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(uuid)}`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    }, []);

    const fetchLevelUpData = useCallback(async (classUuidOverride?: string) => {
        if (!actorId && !classUuidOverride) return;
        try {
            let url = `/api/modules/shadowdark/actors/${actorId}/level-up/data`;
            if (classUuidOverride) url += `?classId=${encodeURIComponent(classUuidOverride)}`;
            if (!actorId) url = `/api/modules/shadowdark/actors/level-up/data?classId=${encodeURIComponent(classUuidOverride!)}`;

            const res = await fetch(url, { cache: 'no-store' });
            const json = await res.json();

            if (json.success && json.data) {
                const apiData = json.data;
                const isCaster = apiData.isSpellcaster;
                if (isCaster !== undefined) setIsSpellcaster(isCaster);

                let total = 0;
                if (apiData.spellsToChoose) {
                    setSpellsToChoose(apiData.spellsToChoose);
                    total = Object.values(apiData.spellsToChoose as Record<number, number>).reduce((a, b) => a + b, 0);
                    setSpellsToChooseTotal(total);
                }

                if (apiData.availableSpells) setAvailableSpells(apiData.availableSpells);

                setStatuses(prev => ({
                    ...prev,
                    spells: (isCaster || total > 0) ? 'IDLE' : 'DISABLED'
                }));
            }
        } catch (e) {
            console.error("Failed to fetch level up data", e);
            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
        }
    }, [actorId]);

    const fetchTableResult = useCallback(async (table: any, context: 'talent' | 'boon' = 'talent'): Promise<any[] | null> => {
        let tableObj = table;
        if (typeof table === 'string') tableObj = await fetchDocument(table);
        if (!tableObj) return null;

        const rawResults = tableObj.results || tableObj.system?.results;
        let results: any[] = [];
        if (Array.isArray(rawResults)) results = rawResults;
        else if (rawResults && typeof rawResults === 'object') {
            results = Array.from(rawResults) as any[];
            if (results.length === 0) results = Object.values(rawResults);
        }

        if (!results || results.length === 0) return [];

        const formula = tableObj.formula || "1d1";
        const roll = simpleRoll(formula);
        let matchingResults = results.filter(r => {
            const range = r.range || [1, 1];
            return roll >= range[0] && roll <= range[1];
        });

        let headerText = "Choose One";
        let validOptions = matchingResults;

        if (matchingResults.length > 1) {
            const headerResult = matchingResults.find(r =>
                (r.type === 'text' || r.type === 0) &&
                (r.text || r.name || r.description || "").toLowerCase().includes("choose") &&
                r.drawn === false
            );

            if (headerResult) {
                const rawText = headerResult.description || headerResult.text || headerResult.name || "Choose One";
                headerText = (rawText.toLowerCase() === 'choose 1' || rawText.toLowerCase() === 'choose one') ? "Choose One" : rawText;
            }

            validOptions = matchingResults.filter(r => {
                if (r.documentId || r.documentUuid) return true;
                const text = (r.text || r.name || r.description || "").trim().toLowerCase();
                if (text === 'choose 1' || text === 'choose one' || text === 'or') return false;
                if (!text) return false;
                return true;
            });
        }

        if (validOptions.length > 1) {
            const choices = validOptions.map(r => ({
                name: r.text || r.name || r.description || "Unknown Option",
                img: r.img,
                original: r
            }));
            setPendingChoices({ header: headerText, options: choices, context });
            return null;
        }

        const resolveDocs = async (resList: any[]) => {
            const resolvedDocs = [];
            for (const r of resList) {
                if (r.type === 'text' || r.type === 0) {
                    resolvedDocs.push({
                        type: 'Talent',
                        name: r.text || r.name,
                        description: r.description || r.text || "",
                        isManual: true
                    });
                } else if (r.documentUuid || r.documentId) {
                    const uuid = r.documentUuid || `Compendium.${r.collection}.${r.documentId}`;
                    const doc = await fetchDocument(uuid);
                    if (doc) resolvedDocs.push(doc);
                }
            }
            return resolvedDocs;
        };

        return await resolveDocs(validOptions);
    }, [fetchDocument, simpleRoll]);

    const handleRollHP = async (isReroll = false) => {
        setStatuses(prev => ({ ...prev, hp: 'LOADING' }));
        setError(null);
        try {
            // Prefer the UUID of the loaded class object, or the target selection, or the prop
            const cId = activeClassObj?.uuid || targetClassUuid || classUuid;
            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-hp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isReroll, classId: cId })
            });
            const json = await res.json();
            if (json.success) {
                setHpRoll(json.roll.total);
                setConfirmReroll(false);
                setStatuses(prev => ({ ...prev, hp: 'COMPLETE' }));
            } else {
                setError(json.error || "Failed to roll HP");
                setStatuses(prev => ({ ...prev, hp: 'ERROR' }));
            }
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, hp: 'ERROR' }));
        }
    };

    const handleRollGold = async (isReroll = false) => {
        setStatuses(prev => ({ ...prev, gold: 'LOADING' }));
        setError(null);
        try {
            const cId = activeClassObj?.uuid || targetClassUuid || classUuid;
            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-gold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isReroll, classId: cId })
            });
            const json = await res.json();
            if (json.success) {
                setGoldRoll(json.roll.total);
                setStatuses(prev => ({ ...prev, gold: 'COMPLETE' }));
            } else {
                setError(json.error || "Failed to roll Gold");
                setStatuses(prev => ({ ...prev, gold: 'ERROR' }));
            }
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, gold: 'ERROR' }));
        }
    };

    const handleRollTalent = async () => {
        if (!talentTable) {
            setError("No Talent Table found for this class.");
            return;
        }
        setStatuses(prev => ({ ...prev, talents: 'LOADING' }));
        setError(null);
        try {
            const resolved = await fetchTableResult(talentTable, 'talent');
            if (resolved) {
                // Deduplicate
                const newItems = resolved.filter(r => {
                    const name = r.name || r.text || r.description;
                    const exists = existingItems.some((i: any) => i.name === name);
                    if (exists) console.log(`[LevelUp] Duplicate Talent rolled: ${name}, strictly disallowed.`);
                    return !exists;
                });

                if (newItems.length < resolved.length) {
                    // If we filtered out items, we should probably re-roll automatically or notify?
                    // For now, let's just ignore the duplicate and rely on user to re-roll if they didn't get enough?
                    // Better: Auto-reroll logic is complex here because we return void.
                    // Simple solution: If duplicate, show specific error or toast?
                    // User objective says "reroll functionality".
                    // If I filter it out, the user sees nothing happened?
                    // Let's filter it. If result is empty, maybe trigger another roll?
                    // Recursion risk.
                    // Safe approach: Add non-duplicates. If count is 0, user sees no change and clicks again?
                    // Actually, if we just exclude it, the 'rolledTalents' count won't increase, so the UI will still show they need to roll.
                    if (newItems.length === 0) {
                        // addNotification("Rolled a duplicate Talent. Please roll again.", "warn"); // We need access to notifications?
                        // Check if addNotification is available. It is not passed to useLevelUp.
                        console.warn("Rolled duplicate talent.");
                    }
                }

                // Check for Special Handlers
                for (const item of newItems) {
                    for (const handler of TALENT_HANDLERS) {
                        if (handler.matches(item) && handler.onRoll) {
                            console.log(`[LevelUp] Triggering handler: ${handler.id}`);
                            handler.onRoll({
                                setStatSelection,
                                setArmorMasterySelection,
                                setExtraSpellSelection,
                                targetLevel
                            }); // Pass necessary setters
                        }
                    }
                }

                setRolledTalents(prev => [...prev, ...newItems]);
                // Status update handled by effect watching rolledTalents vs requiredTalents
            }
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, talents: 'ERROR' }));
        }
    };

    const handleRollBoon = async () => {
        if (!boonTable) {
            setError("No Boon Table found. Please select a Patron first.");
            return;
        }
        setStatuses(prev => ({ ...prev, boons: 'LOADING' }));
        setError(null);
        try {
            const resolved = await fetchTableResult(boonTable, 'boon');
            if (resolved) {
                // Check for duplicate boons? (Allowing for now as per task)

                // Check for Special Handlers
                for (const item of resolved) {
                    for (const handler of TALENT_HANDLERS) {
                        if (handler.matches(item) && handler.onRoll) {
                            console.log(`[LevelUp] Triggering Boon handler: ${handler.id}`);
                            handler.onRoll({
                                setStatSelection,
                                setArmorMasterySelection,
                                setExtraSpellSelection,
                                targetLevel
                            });
                        }
                    }
                }

                setRolledBoons(prev => [...prev, ...resolved]);
            }
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, boons: 'ERROR' }));
        }
    };

    const handleChoiceSelection = async (choiceOrResult: any) => {
        //console.log("handleChoiceSelection Called", choiceOrResult);
        const raw = choiceOrResult.original || choiceOrResult;
        const context = pendingChoices?.context || 'talent';
        setPendingChoices(null);
        setStatuses(prev => ({
            ...prev,
            [context === 'boon' ? 'boons' : 'talents']: 'LOADING'
        }));
        try {
            const resolveDocs = async (r: any) => {
                const resolvedDocs = [];
                if (r.type === 'text' || r.type == 0) {
                    resolvedDocs.push({
                        type: 'Talent',
                        name: r.text || r.name || r.description || "Unknown",
                        description: r.description || r.text || "",
                        isManual: true
                    });
                    console.log("Resolved Manual Doc:", resolvedDocs[resolvedDocs.length - 1]);
                } else if (r.documentUuid || r.documentId) {
                    const uuid = r.documentUuid || `Compendium.${r.collection}.${r.documentId}`;
                    console.log("Fetching document for choice:", uuid);
                    const doc = await fetchDocument(uuid);
                    if (doc) {
                        resolvedDocs.push(doc);
                    } else {
                        console.warn("Failed to fetch document, falling back to manual creation:", r);
                        // Fallback using the data we have
                        resolvedDocs.push({
                            type: context === 'boon' ? 'Boon' : 'Talent', // Best guess based on context
                            name: r.text || r.name || r.description || "Unknown",
                            description: r.description || r.text || "",
                            isManual: true,
                            img: r.img
                        });
                    }
                }
                return resolvedDocs;
            };
            const docs = await resolveDocs(raw);

            // Trigger Handlers for manual selections too
            for (const item of docs) {
                for (const handler of TALENT_HANDLERS) {
                    if (handler.matches(item) && handler.onRoll) {
                        console.log(`[LevelUp] Triggering Selection handler: ${handler.id}`);
                        handler.onRoll({
                            setStatSelection,
                            setArmorMasterySelection,
                            setExtraSpellSelection,
                            targetLevel
                        });
                    }
                }
            }

            if (context === 'boon') setRolledBoons(prev => [...prev, ...docs]);
            else setRolledTalents(prev => [...prev, ...docs]);
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({
                ...prev,
                [context === 'boon' ? 'boons' : 'talents']: 'ERROR'
            }));
        }
    };

    const handleStatToggle = (stat: string) => {
        setStatSelection(prev => {
            const isSelected = prev.selected.includes(stat);
            if (isSelected) {
                return { ...prev, selected: prev.selected.filter(s => s !== stat) };
            } else {
                if (prev.selected.length >= prev.required) return prev;
                return { ...prev, selected: [...prev.selected, stat] };
            }
        });
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setStatuses(prev => ({ ...prev, class: 'LOADING' })); // Block everything
        try {
            const items: any[] = [];

            const resolveToDocs = async (list: any[]) => {
                const results = [];
                for (const item of list) {
                    if (item.isManual) {
                        const effectUuid = findEffectUuid(item.name || item.text || item.description || "");
                        let resolved = false;
                        if (effectUuid) {
                            const doc = await fetchDocument(effectUuid);
                            if (doc) {
                                const cleaned = { ...doc };
                                delete cleaned._id;
                                if (!cleaned.system) cleaned.system = {};
                                cleaned.system.level = targetLevel;
                                results.push(cleaned);
                                resolved = true;
                            }
                        }

                        if (!resolved) {
                            results.push({
                                name: item.name,
                                type: 'Talent',
                                img: 'icons/svg/book.svg',
                                system: {
                                    description: item.description || "",
                                    level: targetLevel
                                }
                            });
                        }
                    } else if (item._id || item.uuid) {
                        const cleaned = { ...item };
                        delete cleaned._id;
                        // Inject Level
                        if (!cleaned.system) cleaned.system = {};
                        // Use deep merge or direct assignment? Direct for now, assuming standard structure.
                        // Some items might have level as a number, others as object. Shadowdark usually uses object { value: N }
                        cleaned.system.level = targetLevel;
                        results.push(cleaned);
                    }
                }
                return results;
            };

            const resolvedTalents = await resolveToDocs(rolledTalents);
            const resolvedBoons = await resolveToDocs(rolledBoons);
            items.push(...resolvedTalents, ...resolvedBoons);

            for (const spell of selectedSpells) {
                const cleaned = { ...spell };
                delete cleaned._id;
                items.push(cleaned);
            }

            if (extraSpellSelection.active && extraSpellSelection.selected.length > 0) {
                for (const spell of extraSpellSelection.selected) {
                    const cleaned = { ...spell };
                    delete cleaned._id;
                    // Ensure it is learned? Shadowdark spells just exist on sheet.
                    items.push(cleaned);
                }
            }

            // --- Mutate Items in place (e.g. Predefined Effects for Stats) ---
            for (const item of items) {
                for (const handler of TALENT_HANDLERS) {
                    if (handler.matches(item)) {
                        if (handler.mutateItem) {
                            handler.mutateItem(item, { statSelection });
                        }
                    }
                }
            }

            // --- Special Handler Items ---
            for (const handler of TALENT_HANDLERS) {
                if (handler.resolveItems) {
                    const extraItems = await handler.resolveItems(
                        { statSelection, weaponMasterySelection, armorMasterySelection },
                        targetLevel,
                        fetchDocument
                    );
                    if (extraItems && extraItems.length > 0) {
                        items.push(...extraItems);
                    }
                }
            }

            // --- BAGGAGE RESOLUTION (Only at Level 1 creation) ---
            if (activeClassObj && currentLevel === 0) {
                const classBaggage = await resolveGear(activeClassObj, fetchDocument);
                items.push(...classBaggage);
            }
            if (ancestry && currentLevel === 0) {
                const ancestryBaggage = await resolveGear(ancestry, fetchDocument);
                items.push(...ancestryBaggage);
            }

            // Include Class if new
            if (activeClassObj && (activeClassObj.uuid !== classObj?.uuid || currentLevel === 0)) {
                const classItem = { ...activeClassObj, type: 'Class' };
                delete classItem._id;
                items.push(classItem);
            }

            // Include Patron
            if (selectedPatronUuid && selectedPatronUuid !== patron?.uuid) {
                const fullPatron = await fetchDocument(selectedPatronUuid);
                if (fullPatron) items.push(fullPatron);
            }

            const finalLanguageUuids = selectedLanguages.filter(lid => {
                const match = availableLanguages.find(al => (al.uuid || al._id) === lid);
                if (!match) return false;
                return !knownLanguages.some(kl => kl.name?.toLowerCase() === match.name?.toLowerCase());
            });

            const data: any = { items, hpRoll, languages: finalLanguageUuids };
            if (goldRoll >= 0) data.gold = goldRoll;

            onComplete(data);
        } catch (e: any) {
            setError(e.message);
            setIsSubmitting(false);
            setStatuses(prev => ({ ...prev, class: 'ERROR' })); // Or just reset to previous
        }
    };

    // Initialization and Sync logic
    useEffect(() => {
        const init = async () => {
            try {
                if (!targetClassUuid && currentLevel === 0) {
                    setActiveClassObj(null);
                    setStatuses(prev => ({ ...prev, class: 'READY' }));
                    return;
                }
                setStatuses(prev => ({ ...prev, class: 'LOADING' }));

                let currentClass = activeClassObj;
                let effectiveClassUuid: string | undefined = targetClassUuid || classUuid;

                if (targetClassUuid && targetClassUuid !== (activeClassObj?.uuid || classUuid)) {
                    effectiveClassUuid = targetClassUuid;
                    const targetClassFromList = availableClasses.find((c: any) => (c.uuid === targetClassUuid) || (c._id === targetClassUuid));
                    let fetchUuid = targetClassUuid;
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
                } else if (!activeClassObj && classObj) {
                    currentClass = classObj;
                    setActiveClassObj(classObj);
                } else if (!activeClassObj && !classObj && classUuid) {
                    // Fallback: Fetch class by UUID if object not provided
                    const cls = await fetchDocument(classUuid);
                    if (cls) {
                        currentClass = cls;
                        setActiveClassObj(cls);
                    }
                }

                if (actorId || effectiveClassUuid) await fetchLevelUpData(effectiveClassUuid);

                if (currentClass?.system?.classTalentTable) setTalentTable(currentClass.system.classTalentTable);

                if (currentClass) {
                    const requiresPatron = Boolean(currentClass.system?.patron?.required);

                    // --- Pre-fetch Patrons if needed ---
                    let patronList = [];
                    if (requiresPatron && availablePatrons.length === 0) {
                        try {
                            setStatuses(prev => ({ ...prev, patron: 'LOADING' }));
                            const response = await fetch('/api/system/data');
                            const data = await response.json();
                            patronList = data.patrons || [];
                            setAvailablePatrons(patronList);
                            setStatuses(prev => ({ ...prev, patron: 'READY' }));
                        } catch (e) {
                            setStatuses(prev => ({ ...prev, patron: 'ERROR' }));
                            console.error("Failed to pre-fetch patrons inside init", e);
                        }
                    } else if (availablePatrons.length > 0) {
                        patronList = availablePatrons;
                    }

                    const isOddLevel = targetLevel % 2 !== 0;

                    let reqBoons = 0;
                    let choices = 0;
                    // Standard talent progression (1 at odd levels)
                    let talentTotal = isOddLevel ? 1 : 0;

                    if (requiresPatron) {
                        // Warlock / Patron Class Logic
                        // Always show the boon section if patron is required
                        if (targetLevel === 1) {
                            // Level 1: Gain a Boon. No choice (Talent or Boon/Spell)
                            reqBoons = 1;
                            choices = 0;
                            talentTotal = 0; // Replaces standard talent
                            setNeedsBoon(true);
                        } else if (isOddLevel) {
                            // Odd Levels > 1: One Choice (Talent or Boon)
                            reqBoons = 0;
                            choices = 1;
                            talentTotal = 0; // Replaces standard talent
                            setNeedsBoon(true);
                        } else {
                            // Even Levels: No advancements
                            reqBoons = 0;
                            choices = 0;
                            talentTotal = 0;
                        }

                        // Try to find the patron
                        // 1. Helper state (if re-entered)
                        // 2. Prop (if passed)
                        // 3. System default
                        // 4. Match in available params?
                        const patronUuidToFetch = selectedPatronUuid || patronUuid || currentClass.system?.patron?.uuid;

                        // If we have a UUID, fetch it.
                        if (patronUuidToFetch) {
                            const fullPatron = await fetchDocument(patronUuidToFetch);
                            if (fullPatron) setFetchedPatron(fullPatron);
                            if (fullPatron?.system?.boonTable) setBoonTable(fullPatron.system.boonTable);
                        } else {
                            setBoonTable(null);
                            setFetchedPatron(null);
                        }

                    } else {
                        // Standard Class Logic
                        setNeedsBoon(false);
                        // talentTotal matches standard (1 on odd levels)
                    }

                    setStartingBoons(reqBoons);
                    setChoiceRolls(choices);

                    if (actorId) {
                        const actorDoc = await fetchDocument(`Actor.${actorId}`);
                        if (actorDoc?.items) {
                            setExistingItems(actorDoc.items);
                            // Run Init Handlers (e.g. Ambitious)
                            for (const handler of TALENT_HANDLERS) {
                                if (handler.onInit) {
                                    const res = handler.onInit({ actor: actorDoc, targetLevel });
                                    if (res.requiredTalents) talentTotal += res.requiredTalents;
                                    // if (res.choiceRolls) choices += res.choiceRolls;
                                }
                            }
                        }
                    }
                    setRequiredTalents(talentTotal);
                    setStatSelection({ required: 0, selected: [] }); // Reset selection on init
                    setWeaponMasterySelection({ required: 0, selected: [] });
                    setArmorMasterySelection({ required: 0, selected: [] });
                }
            } catch (error) {
                console.error("Error in LevelUpModal init:", error);
                setStatuses(prev => ({ ...prev, class: 'ERROR' }));
            } finally {
                setStatuses(prev => ({
                    ...prev,
                    class: activeClassObj ? 'COMPLETE' : 'READY',
                    hp: 'IDLE',
                    gold: currentLevel === 0 ? 'IDLE' : 'DISABLED',
                    languages: targetLevel === 1 ? 'IDLE' : 'DISABLED',
                    extraSpells: 'DISABLED'
                }));
            }
        };
        init();
    }, [classObj, actorId, targetLevel, targetClassUuid, selectedPatronUuid, patronUuid]);

    // Fetch Extra Spells if needed
    useEffect(() => {
        if (extraSpellSelection.active && extraSpellsList.length === 0) {
            const fetchSpells = async () => {
                try {
                    const res = await fetch(`/api/modules/shadowdark/spells/list?source=${extraSpellSelection.source}`);
                    const json = await res.json();
                    if (json.success) {
                        setExtraSpellsList(json.spells);
                    }
                } catch (e) {
                    console.error("Failed to fetch extra spells", e);
                }
            };
            fetchSpells();
        }
    }, [extraSpellSelection.active, extraSpellSelection.source]);



    useEffect(() => {
        if (activeClassObj) {
            // Only allow language selection at Level 1 (or 0 -> 1)
            if (targetLevel === 1 || currentLevel === 0) {
                const langData = activeClassObj.system?.languages || { common: 0, fixed: [], rare: 0, select: 0 };
                const groups = [];
                setFixedLanguages(langData.fixed || []);
                setSelectedLanguages(prev => [...new Set([...prev, ...(langData.fixed || [])])]);

                if (langData.select > 0) groups.push({ id: 'select', label: 'Class Selection', count: langData.select, options: langData.selectOptions });
                if (langData.common > 0) groups.push({ id: 'common', label: 'Common Languages', count: langData.common });
                if (langData.rare > 0) groups.push({ id: 'rare', label: 'Rare Languages', count: langData.rare });
                setLanguageGroups(groups);
            } else {
                setLanguageGroups([]);
                setFixedLanguages([]);
            }
        }
    }, [activeClassObj, targetLevel, currentLevel]);

    // Clear LOADING status when selections update
    useEffect(() => {
        setStatuses(prev => {
            const next = { ...prev };
            let changed = false;

            if (prev.talents === 'LOADING') {
                next.talents = 'READY';
                changed = true;
            }
            if (prev.boons === 'LOADING') {
                next.boons = 'READY';
                changed = true;
            }

            return changed ? next : prev;
        });
    }, [rolledTalents, rolledBoons]);

    useEffect(() => {
        if (targetClassUuid && targetClassUuid !== classUuid) {
            setHpRoll(0); setGoldRoll(0); setRolledTalents([]); setRolledBoons([]); setSelectedSpells([]); setPendingChoices(null); setSelectedPatronUuid("");
        }
    }, [targetClassUuid]);

    const isComplete = useCallback(() => {
        // if (hpRoll <= 0) { console.log('Blocked: HP'); return false; }
        //if (rolledTalents.length < requiredTalents) { console.log('Blocked: Talents', rolledTalents.length, requiredTalents); return false; }
        if (rolledTalents.length < requiredTalents) { return false; }

        // Check Boons if needed
        //if (needsBoon && startingBoons > 0 && rolledBoons.length < startingBoons) { console.log('Blocked: Boons'); return false; }
        if (needsBoon && startingBoons > 0 && rolledBoons.length < startingBoons) { return false; }

        // Check Handlers blocking
        for (const handler of TALENT_HANDLERS) {
            if (handler.isBlocked && handler.isBlocked({ statSelection, weaponMasterySelection, armorMasterySelection })) return false;
        }

        // Check Flexible Choices (Talents OR Boons)
        // Check Flexible Choices (Talents OR Boons OR Spells)
        const extraTalents = Math.max(0, rolledTalents.length - requiredTalents);
        const extraBoons = Math.max(0, rolledBoons.length - (needsBoon ? startingBoons : 0));
        const extraSpells = isSpellcaster ? Math.max(0, selectedSpells.length - spellsToChooseTotal) : 0;

        if ((extraTalents + extraBoons + extraSpells) < choiceRolls) {
            /*console.log('Blocked: Choices', {
                extraTalents,
                extraBoons,
                extraSpells,
                choiceRolls,
                rolledTalents: rolledTalents.length,
                rolledBoons: rolledBoons.length,
                requiredTalents,
                startingBoons,
                needsBoon,
                selectedSpells: selectedSpells.length,
                spellsToChooseTotal
            });*/
            return false;
        }

        if (extraSpellSelection.active) {
            if (extraSpellSelection.selected.length < 1) return false;
        }

        for (const group of languageGroups) {
            const groupOptions = availableLanguages?.filter((l: any) => {
                const id = l.uuid || l._id;
                if (fixedLanguages.includes(id)) return false;
                if (group.id === 'select') return group.options?.includes(id);
                if (group.id === 'common') return !l.rarity || l.rarity === 'common';
                if (group.id === 'rare') return l.rarity === 'rare';
                return false;
            }) || [];

            const groupSelections = selectedLanguages.filter(lid => {
                const opt = groupOptions.find((o: any) => (o.uuid || o._id) === lid);
                if (!opt) return false;
                // Double check if we already know it (should be filtered out by UI but strict check here)
                return !knownLanguages.some(kl => kl.name?.toLowerCase() === opt.name?.toLowerCase());
            });

            if (groupSelections.length < group.count) { /*console.log('Blocked: Languages');*/ return false; }
        }

        if (isSpellcaster && spellsToChooseTotal > 0 && availableSpells && availableSpells.length > 0) {
            if (selectedSpells.length < spellsToChooseTotal) { /*console.log('Blocked: Spells Total', selectedSpells.length, spellsToChooseTotal);*/ return false; }
            for (const [tier, count] of Object.entries(spellsToChoose)) {
                const selectedInTier = selectedSpells.filter(s => Number(s.tier || s.system?.tier || 0) === Number(tier)).length;
                if (selectedInTier < count) { /*console.log('Blocked: Spells Tier', tier, selectedInTier, count);*/ return false; }
            }
        }
        return true;
    }, [hpRoll, rolledTalents, requiredTalents, needsBoon, rolledBoons, startingBoons, choiceRolls, languageGroups, selectedLanguages, knownLanguages, selectedSpells, spellsToChooseTotal, isSpellcaster, spellsToChoose, availableLanguages, fixedLanguages, availableSpells, statuses, statSelection, weaponMasterySelection, armorMasterySelection, extraSpellSelection]);

    const [hpFormula, hpMax] = useMemo(() => {
        const hitDieStr = activeClassObj?.system?.hitPoints || "1d6";
        const dieVal = parseInt(hitDieStr.replace(/[^0-9]/g, '')) || 6;
        const conMod = _abilities?.con?.mod || 0;
        const formula = `1${hitDieStr} ${conMod >= 0 ? '+' : ''} ${conMod}`;
        const max = dieVal + conMod + dieVal; // "Extra die more than formula"
        return [formula, max];
    }, [activeClassObj, _abilities]);

    const goldFormula = "2d6 x 5";
    const goldMax = 90;

    return {
        state: {
            statuses,
            isSubmitting,
            loading: Object.values(statuses).some(s => s === 'LOADING'),
            loadingClass: statuses.class === 'LOADING',
            error, confirmReroll, targetClassUuid, activeClassObj, selectedPatronUuid, availablePatrons,
            loadingPatrons: statuses.patron === 'LOADING',
            selectedLanguages, fixedLanguages, knownLanguages, languageGroups, talentTable, boonTable, availableSpells,
            hpRoll, goldRoll, rolledTalents, rolledBoons, selectedSpells, pendingChoices, spellsToChoose, spellsToChooseTotal,
            isSpellcaster, requiredTalents, needsBoon, startingBoons, choiceRolls,
            hpFormula, hpMax, goldFormula, goldMax, fetchedPatron, statSelection,
            weaponMasterySelection, armorMasterySelection,
            extraSpellSelection, extraSpellsList
        },
        actions: {
            setTargetClassUuid, setSelectedPatronUuid, setHpRoll, setGoldRoll, setConfirmReroll,
            setError, setRolledTalents, setRolledBoons, setSelectedSpells,
            handleRollHP, handleRollGold, handleRollTalent, handleRollBoon, handleChoiceSelection, handleConfirm,
            isComplete, setSelectedLanguages, setStatSelection, handleStatToggle,
            setWeaponMasterySelection, setArmorMasterySelection,
            setExtraSpellSelection
        }
    };
};
