
import { useState, useEffect, useCallback } from 'react';
import { resolveBaggage } from './baggageResolver';

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
}

export const useLevelUp = (props: LevelUpProps) => {
    const {
        actorId,
        currentLevel,
        targetLevel,
        ancestry,
        classObj,
        classUuid,
        patron,
        abilities: _abilities,
        availableClasses = [],
        availableLanguages = [],
        onComplete,
    } = props;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmReroll, setConfirmReroll] = useState(false);

    const [targetClassUuid, setTargetClassUuid] = useState("");
    const [activeClassObj, setActiveClassObj] = useState<any>(classObj);
    const [selectedPatronUuid, setSelectedPatronUuid] = useState<string>("");
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

    const [isSpellcaster, setIsSpellcaster] = useState(Boolean(classObj?.system?.spellcasting?.class || classObj?.system?.spellcasting?.ability));
    const [requiredTalents, setRequiredTalents] = useState(0);
    const [needsBoon, setNeedsBoon] = useState(Boolean(classObj?.system?.patron?.required));
    const [startingBoons, setStartingBoons] = useState(0);

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
                if (apiData.isSpellcaster !== undefined) setIsSpellcaster(apiData.isSpellcaster);
                if (apiData.availableSpells) setAvailableSpells(apiData.availableSpells);
                if (apiData.spellsToChoose) {
                    setSpellsToChoose(apiData.spellsToChoose);
                    const total = Object.values(apiData.spellsToChoose as Record<number, number>).reduce((a, b) => a + b, 0);
                    setSpellsToChooseTotal(total);
                }
            }
        } catch (e) {
            console.error("Failed to fetch level up data", e);
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
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-hp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isReroll, classId: activeClassObj?.uuid || classUuid })
            });
            const json = await res.json();
            if (json.success) {
                setHpRoll(json.roll.total);
                setConfirmReroll(false);
            } else {
                setError(json.error || "Failed to roll HP");
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRollGold = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-gold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classId: activeClassObj?.uuid || classUuid })
            });
            const json = await res.json();
            if (json.success) setGoldRoll(json.roll.total);
            else setError(json.error || "Failed to roll Gold");
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRollTalent = async () => {
        if (!talentTable) {
            setError("No Talent Table found for this class.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const resolved = await fetchTableResult(talentTable, 'talent');
            if (resolved) {
                setRolledTalents(prev => [...prev, ...resolved]);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRollBoon = async () => {
        if (!boonTable) {
            setError("No Boon Table found. Please select a Patron first.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const resolved = await fetchTableResult(boonTable, 'boon');
            if (resolved) {
                setRolledBoons(prev => [...prev, ...resolved]);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChoiceSelection = async (choiceOrResult: any) => {
        const raw = choiceOrResult.original || choiceOrResult;
        const context = pendingChoices?.context || 'talent';
        setPendingChoices(null);
        setLoading(true);
        try {
            const resolveDocs = async (r: any) => {
                const resolvedDocs = [];
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
                return resolvedDocs;
            };
            const docs = await resolveDocs(raw);
            if (context === 'boon') setRolledBoons(prev => [...prev, ...docs]);
            else setRolledTalents(prev => [...prev, ...docs]);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setLoading(true);
        try {
            const items: any[] = [];

            const resolveToDocs = async (list: any[]) => {
                const results = [];
                for (const item of list) {
                    if (item.isManual) {
                        results.push({
                            name: item.name,
                            type: 'Talent',
                            img: 'icons/svg/book.svg',
                            system: { description: item.description || "" }
                        });
                    } else if (item._id || item.uuid) {
                        const cleaned = { ...item };
                        delete cleaned._id;
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

            // --- BAGGAGE RESOLUTION ---
            if (activeClassObj) {
                const classBaggage = await resolveBaggage(activeClassObj, fetchDocument);
                items.push(...classBaggage);
            }
            if (ancestry) {
                const ancestryBaggage = await resolveBaggage(ancestry, fetchDocument);
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
        } finally {
            setLoading(false);
        }
    };

    // Initialization and Sync logic
    useEffect(() => {
        const init = async () => {
            try {
                if (!targetClassUuid && currentLevel === 0) {
                    setLoading(false);
                    return;
                }
                setLoading(true);
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
                }

                if (actorId || effectiveClassUuid) await fetchLevelUpData(effectiveClassUuid);

                if (currentClass?.system?.classTalentTable) setTalentTable(currentClass.system.classTalentTable);

                if (currentClass) {
                    const requiresBoon = Boolean(currentClass.system?.patron?.required);
                    setNeedsBoon(requiresBoon);
                    if (targetLevel === 1 && requiresBoon) setStartingBoons(currentClass.system?.patron?.startingBoons || 0);
                    else setStartingBoons(0);

                    const patronUuidToFetch = selectedPatronUuid || currentClass.system?.patron?.uuid;
                    if (requiresBoon && patronUuidToFetch) {
                        const fullPatron = await fetchDocument(patronUuidToFetch);
                        if (fullPatron?.system?.boonTable) setBoonTable(fullPatron.system.boonTable);
                    } else setBoonTable(null);
                }

                if (actorId) {
                    const actorDoc = await fetchDocument(`Actor.${actorId}`);
                    if (actorDoc) {
                        const existingLangsFromItems = actorDoc.items?.filter((i: any) => i.type === 'Language') || [];
                        const actorLangsRaw = actorDoc.system?.languages || [];
                        const knownIds: string[] = [];
                        const knownDocs: any[] = [];

                        existingLangsFromItems.forEach((item: any) => {
                            knownDocs.push(item);
                            const match = availableLanguages.find((avail: any) => avail.name?.toLowerCase() === item.name?.toLowerCase());
                            if (match) knownIds.push(match.uuid || match._id);
                        });

                        actorLangsRaw.forEach((langValue: string) => {
                            const match = availableLanguages.find((avail: any) => avail.uuid === langValue || avail._id === langValue || avail.name?.toLowerCase() === langValue?.toLowerCase());
                            if (match) {
                                const id = match.uuid || match._id;
                                if (id && !knownIds.includes(id)) {
                                    knownIds.push(id);
                                    knownDocs.push(match);
                                }
                            }
                        });
                        setKnownLanguages(knownDocs);
                        if (knownIds.length > 0) setSelectedLanguages(prev => [...new Set([...prev, ...knownIds])]);
                    }
                }

                const oddLevelTalent = targetLevel % 2 !== 0 ? 1 : 0;
                let talentTotal = oddLevelTalent;
                if (actorId && targetLevel === 1) {
                    const actorDoc = await fetchDocument(`Actor.${actorId}`);
                    if (actorDoc?.items?.find((i: any) => i.name === "Ambitious")) talentTotal += 1;
                }
                setRequiredTalents(talentTotal);
            } catch (error) {
                console.error("Error in LevelUpModal init:", error);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [classObj, actorId, targetLevel, targetClassUuid, selectedPatronUuid]);

    useEffect(() => {
        const fetchPatrons = async () => {
            if (needsBoon && availablePatrons.length === 0) {
                setLoadingPatrons(true);
                try {
                    const response = await fetch('/api/system/data');
                    const data = await response.json();
                    if (data.patrons) setAvailablePatrons(data.patrons);
                } finally {
                    setLoadingPatrons(false);
                }
            }
        };
        fetchPatrons();
    }, [needsBoon]);

    useEffect(() => {
        if (activeClassObj) {
            const langData = activeClassObj.system?.languages || { common: 0, fixed: [], rare: 0, select: 0 };
            const groups = [];
            setFixedLanguages(langData.fixed || []);
            setSelectedLanguages(prev => [...new Set([...prev, ...(langData.fixed || [])])]);

            if (langData.select > 0) groups.push({ id: 'select', label: 'Class Selection', count: langData.select, options: langData.selectOptions });
            if (langData.common > 0) groups.push({ id: 'common', label: 'Common Languages', count: langData.common });
            if (langData.rare > 0) groups.push({ id: 'rare', label: 'Rare Languages', count: langData.rare });
            setLanguageGroups(groups);
        }
    }, [activeClassObj]);

    useEffect(() => {
        if (targetClassUuid && targetClassUuid !== classUuid) {
            setHpRoll(0); setGoldRoll(0); setRolledTalents([]); setRolledBoons([]); setSelectedSpells([]); setPendingChoices(null); setSelectedPatronUuid("");
        }
    }, [targetClassUuid]);

    const isComplete = useCallback(() => {
        if (hpRoll <= 0) return false;
        if (rolledTalents.length < requiredTalents) return false;
        if (needsBoon && startingBoons > 0 && rolledBoons.length < startingBoons) return false;

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
                return !knownLanguages.some(kl => kl.name?.toLowerCase() === opt.name?.toLowerCase());
            });

            if (groupSelections.length < group.count) return false;
        }

        if (isSpellcaster && spellsToChooseTotal > 0) {
            if (selectedSpells.length < spellsToChooseTotal) return false;
            for (const [tier, count] of Object.entries(spellsToChoose)) {
                const selectedInTier = selectedSpells.filter(s => Number(s.tier || s.system?.tier || 0) === Number(tier)).length;
                if (selectedInTier < count) return false;
            }
        }
        return true;
    }, [hpRoll, rolledTalents, requiredTalents, needsBoon, rolledBoons, startingBoons, languageGroups, selectedLanguages, knownLanguages, selectedSpells, spellsToChooseTotal, isSpellcaster, spellsToChoose]);

    return {
        state: {
            loading, error, confirmReroll, targetClassUuid, activeClassObj, selectedPatronUuid, availablePatrons, loadingPatrons,
            selectedLanguages, fixedLanguages, knownLanguages, languageGroups, talentTable, boonTable, availableSpells,
            hpRoll, goldRoll, rolledTalents, rolledBoons, selectedSpells, pendingChoices, spellsToChoose, spellsToChooseTotal,
            isSpellcaster, requiredTalents, needsBoon, startingBoons
        },
        actions: {
            setTargetClassUuid, setSelectedPatronUuid, setHpRoll, setGoldRoll, setConfirmReroll,
            setError, setRolledTalents, setSelectedSpells,
            handleRollHP, handleRollGold, handleRollTalent, handleRollBoon, handleChoiceSelection, handleConfirm,
            isComplete, setSelectedLanguages
        }
    };
};
