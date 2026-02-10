import { useState, useEffect, useCallback, useMemo } from 'react';
import { resolveGear } from './resolveGear';
import { TALENT_HANDLERS } from './talent-handlers';
import { ROLL_TABLE_PATTERNS } from '../../../data/roll-table-patterns';
import { findEffectUuid, SYSTEM_PREDEFINED_EFFECTS } from '../../../data/talent-effects';
import { logger } from '../../../../../app/ui/logger';

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
    knownLanguages?: any[]; // Passed for new characters (pre-gen selections)
    skipLanguageSelection?: boolean; // For when languages are handled externally (Generator)
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
        knownLanguages: initialKnownLanguages = [],
        skipLanguageSelection = false,
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

    const [targetClassUuid, setTargetClassUuid] = useState(classUuid || "");
    const [activeClassObj, setActiveClassObj] = useState<any>(classObj);

    // Sync props to state if not yet set
    useEffect(() => {
        if (!targetClassUuid && classUuid) setTargetClassUuid(classUuid);
    }, [classUuid, targetClassUuid]);

    useEffect(() => {
        if (!activeClassObj && classObj) setActiveClassObj(classObj);
    }, [classObj, activeClassObj]);

    // Initialize selectedPatronUuid from props if available
    const [selectedPatronUuid, setSelectedPatronUuid] = useState<string>(patronUuid || patron?.uuid || "");
    useEffect(() => {
        if (!selectedPatronUuid && (patronUuid || patron?.uuid)) {
            setSelectedPatronUuid(patronUuid || patron?.uuid || "");
        }
    }, [patronUuid, patron]);

    const [fetchedPatron, setFetchedPatron] = useState<any>(null);
    const [availablePatrons, setAvailablePatrons] = useState<any[]>([]);


    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
    const [fixedLanguages, setFixedLanguages] = useState<string[]>([]);
    const [knownLanguages, setKnownLanguages] = useState<any[]>(initialKnownLanguages);
    const [languageGroups, setLanguageGroups] = useState<any[]>([]);

    const [talentTable, setTalentTable] = useState<any>(null);
    const [boonTable, setBoonTable] = useState<any>(null);
    const [availableSpells, setAvailableSpells] = useState<any[]>([]);

    const [hpRoll, setHpRoll] = useState<number | null>(null);
    const [hpFormula, setHpFormula] = useState<string>("");
    const [hpMax, setHpMax] = useState<number>(0);
    const [goldRoll, setGoldRoll] = useState<number | null>(null);
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

    // Session State
    const [token, setToken] = useState<string | null>(null);

    // Load token on mount
    useEffect(() => {
        const stored = sessionStorage.getItem('sheet-delver-token');
        if (stored) setToken(stored);
    }, []);

    const simpleRoll = useCallback((formula: string): number => {
        try {
            const match = formula.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
            if (!match) {
                const num = parseInt(formula);
                return isNaN(num) ? 0 : num;
            }
            const [, countStr, dieStr, op, modStr] = match;
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

    const fetchByUuid = useCallback(async (uuid: string) => {
        try {
            const headers: any = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(uuid)}`, { headers });
            if (!res.ok) return null;
            const data = await res.json();
            return data.document;
        } catch (e) {
            logger.error(`[LevelUp] Failed to fetch document: ${uuid}`, e);
            return null;
        }
    }, [token]);

    const fetchDocument = fetchByUuid;

    const fetchLevelUpData = useCallback(async (classUuidOverride?: string) => {
        if (!actorId && !classUuidOverride) return;
        try {
            let url = `/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/data`;
            const params = new URLSearchParams();
            if (classUuidOverride) params.set('classId', classUuidOverride);
            if (selectedPatronUuid) params.set('patronId', selectedPatronUuid);

            const queryString = params.toString();
            if (queryString) url += `?${queryString}`;

            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(url, { headers, cache: 'no-store' });
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

                if (apiData.availableSpells) {
                    const unique = new Map();
                    if (Array.isArray(apiData.availableSpells)) {
                        apiData.availableSpells.forEach((s: any) => {
                            if (!unique.has(s.name)) unique.set(s.name, s);
                        });
                        setAvailableSpells(Array.from(unique.values()));
                    }
                }
                if (apiData.knownLanguages) setKnownLanguages(apiData.knownLanguages);
                if (apiData.talentTable) setTalentTable(apiData.talentTable);
                if (apiData.patronBoonTable) setBoonTable(apiData.patronBoonTable);

                setStatuses(prev => ({
                    ...prev,
                    spells: (isCaster || total > 0) ? 'IDLE' : 'DISABLED',
                    boons: apiData.patronBoonTable ? 'IDLE' : 'DISABLED'
                }));
            }
        } catch (e) {
            console.error("Failed to fetch level up data", e);
            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
        }
    }, [actorId, token]);

    const handleRollHP = async (isReroll = false) => {
        console.log("[LevelUp] handleRollHP triggered. isReroll:", isReroll);
        setStatuses(prev => ({ ...prev, hp: 'LOADING' }));
        setError(null);
        try {
            console.log('LevelUpAlt] Running...');
            // Prefer the UUID of the loaded class object, or the target selection, or the prop
            const cId = activeClassObj?.uuid || targetClassUuid || classUuid;
            console.log("[LevelUp] Rolling HP for classId:", cId, "ActorId:", actorId);

            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-hp`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ isReroll, classId: cId })
            });
            const json = await res.json();
            if (json.success) {
                setHpRoll(json.roll.total);
                if (json.formula) setHpFormula(json.formula);
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

            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-gold`, {
                method: 'POST',
                headers,
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
            console.log('[LevelUp] Rolling talent table:', talentTable);

            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/foundry/roll-table', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tableUuid: talentTable,
                    actorId: actorId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to roll talent');
            }

            const data = await res.json();
            const resolved = data.items || [];

            logger.info("[LevelUp] Raw resolved items:", resolved);

            if (resolved.length > 0) {
                if (resolved.length > 1) {
                    // If we have an instruction, use it. If not, default to "Choose One"
                    const instructionItem = resolved.find((r: any) => {
                        const name = r.name || "";
                        const text = r.text || "";
                        const desc = r.description || "";
                        return (r.type === 0 || r.type === 'text') && (
                            ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(name) ||
                            ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(text) ||
                            ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(desc) ||
                            name.toUpperCase().includes("CHOOSE")
                        );
                    });

                    logger.info("[LevelUp] Multiple results detected. Forcing Choice Selection.");
                    const options = resolved.filter((r: any) => r !== instructionItem).map((r: any) => ({
                        ...r,
                        img: r.img || "icons/svg/d20.svg"
                    }));

                    let header = "Select an Option";
                    if (instructionItem) {
                        header = instructionItem.text || instructionItem.name || "Select an Option";
                    }

                    setPendingChoices({
                        header,
                        options,
                        context: 'talent'
                    });

                    setStatuses(prev => ({ ...prev, talents: 'READY' }));
                    return;
                }

                // Deduplicate
                const newItems = resolved.filter((r: any) => {
                    const name = r.name || r.text || r.description;
                    const exists = existingItems.some((i: any) => i.name === name);
                    if (exists) logger.debug(`[LevelUp] Duplicate Talent rolled: ${name}, strictly disallowed.`);
                    return !exists;
                });

                if (newItems.length === 0 && resolved.length > 0) {
                    logger.warn("Rolled duplicate talent.");
                }

                const itemsToAdd: any[] = [];

                // Check for Special Handlers
                for (const item of newItems) {
                    let suppressed = false;
                    for (const handler of TALENT_HANDLERS) {
                        if (handler.matches(item) && handler.onRoll) {
                            logger.debug(`[LevelUp] Triggering handler: ${handler.id}`);
                            const result = handler.onRoll({
                                setStatSelection,
                                setArmorMasterySelection,
                                setExtraSpellSelection,
                                setPendingChoices,
                                targetLevel,
                                rolledItem: item
                            });

                            // If handler returns true, it consumed the item (don't add to list)
                            if (result === true) {
                                suppressed = true;
                            }
                        }
                    }
                    if (!suppressed) {
                        itemsToAdd.push(item);
                    }
                }

                setRolledTalents(prev => [...prev, ...itemsToAdd]);
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
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/foundry/roll-table', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tableUuid: boonTable,
                    actorId: actorId
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to roll boon');
            }

            const data = await res.json();
            const resolved = data.items || [];

            if (resolved.length > 0) {

                // Check for Choice Group (same logic as Talents)
                const instructionItem = resolved.find((r: any) => {
                    const name = r.name || "";
                    const text = r.text || "";
                    const desc = r.description || "";

                    const matches = (r.type === 0 || r.type === 'text') && (
                        ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(name) ||
                        ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(text) ||
                        ROLL_TABLE_PATTERNS.CHOICE_INSTRUCTIONS.includes(desc) ||
                        name.toUpperCase().includes("CHOOSE") // Fallback for Boons which might just say "CHOOSE 1"
                    );
                    return matches;
                });

                if (resolved.length > 1 && instructionItem) {
                    logger.info("[LevelUp] Detected Choice Group in Boon roll.");

                    const options = resolved.filter((r: any) => r !== instructionItem).map((r: any) => ({
                        ...r,
                        img: r.img || "icons/svg/d20.svg"
                    }));

                    setPendingChoices({
                        header: instructionItem.text || instructionItem.name || "Choose One",
                        options: options,
                        context: 'boon'
                    });

                    setStatuses(prev => ({ ...prev, boons: 'READY' }));
                    return;
                }

                // Check for Special Handlers
                for (const item of resolved) {
                    for (const handler of TALENT_HANDLERS) {
                        if (handler.matches(item) && handler.onRoll) {
                            logger.debug(`[LevelUp] Triggering Boon handler: ${handler.id}`);
                            handler.onRoll({
                                setStatSelection,
                                setArmorMasterySelection,
                                setExtraSpellSelection,
                                targetLevel,
                                rolledItem: item
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
        const raw = choiceOrResult.original || choiceOrResult;
        const context = pendingChoices?.context || 'talent';
        setPendingChoices(null);
        setStatuses(prev => ({
            ...prev,
            [context === 'boon' ? 'boons' : 'talents']: 'LOADING'
        }));
        try {
            const resolveDocs = async (r: any): Promise<any[]> => {
                const resolvedDocs: any[] = [];

                // If it's a RollTable, we need to roll it to get the actual item
                if (r.type === 'RollTable' || r.documentCollection === 'RollTable') {
                    logger.info("[LevelUp] Selected a RollTable, rolling for result...");
                    const rollTableHeaders: any = { 'Content-Type': 'application/json' };
                    if (token) rollTableHeaders['Authorization'] = `Bearer ${token}`;
                    const res = await fetch('/api/foundry/roll-table', {
                        method: 'POST',
                        headers: rollTableHeaders,
                        body: JSON.stringify({
                            tableUuid: r.documentUuid || r.uuid || `Compendium.${r.collection}.${r.documentId}`,
                            actorId: actorId
                        })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        // Recursively resolve the result of the nested roll
                        if (data.items && data.items.length > 0) {
                            for (const child of data.items) {
                                const childDocs = await resolveDocs(child);
                                resolvedDocs.push(...childDocs);
                            }
                        }
                    } else {
                        logger.error("[LevelUp] Failed to roll nested table");
                    }
                    return resolvedDocs;
                }

                // If it's a "text" result (from a table), try to resolve it to a real item or valid fallback
                if (r.type === 'text' || r.type == 0) {
                    const text = r.text || r.name || r.description || "";
                    const predefinedUuid = findEffectUuid(text);

                    if (predefinedUuid) {
                        const doc = await fetchByUuid(predefinedUuid);
                        if (doc) {
                            resolvedDocs.push(doc);
                        } else {
                            resolvedDocs.push({
                                type: context === 'boon' ? 'Boon' : 'Talent',
                                name: text || "Unknown",
                                description: r.description || text || "",
                                isManual: true,
                                img: r.img || "icons/svg/item-bag.svg",
                                system: {}
                            });
                        }
                    } else {
                        resolvedDocs.push({
                            type: context === 'boon' ? 'Boon' : 'Talent',
                            name: text || "Unknown",
                            description: r.description || text || "",
                            isManual: true,
                            img: r.img || "icons/svg/item-bag.svg",
                            system: {}
                        });
                    }
                }
                // If it's already a resolved document from the server (has type and system)
                else if (r.type && r.system && !r.isManual) {
                    resolvedDocs.push(r);
                } else if (r.documentUuid || r.documentId || r.uuid) {
                    const uuid = r.documentUuid || r.uuid || `Compendium.${r.collection}.${r.documentId}`;
                    logger.debug("Fetching document for choice:", uuid);
                    const doc = await fetchByUuid(uuid);
                    if (doc) {
                        resolvedDocs.push(doc);
                    } else {
                        // Fallback
                        resolvedDocs.push({
                            type: context === 'boon' ? 'Boon' : 'Talent',
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

            // Trigger Handlers
            for (const item of docs) {
                for (const handler of TALENT_HANDLERS) {
                    if (handler.matches(item) && handler.onRoll) {
                        logger.debug(`[LevelUp] Triggering Selection handler: ${handler.id}`);
                        handler.onRoll({
                            setStatSelection,
                            setArmorMasterySelection,
                            setExtraSpellSelection,
                            targetLevel,
                            rolledItem: item
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
        setStatuses(prev => ({ ...prev, class: 'LOADING' }));
        try {
            const items: any[] = [];

            const resolveToDocs = async (list: any[]) => {
                const results = [];
                for (const item of list) {
                    if (item.isManual) {
                        const effectUuid = findEffectUuid(item.name || item.text || item.description || "");
                        let resolved = false;
                        if (effectUuid) {
                            const doc = await fetchByUuid(effectUuid);
                            if (doc) {
                                const cleaned = (doc.toObject ? doc.toObject() : { ...doc });
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
                                type: item.type || 'Talent',
                                img: item.img || 'icons/svg/book.svg',
                                system: {
                                    description: item.description || item.text || "",
                                    level: targetLevel
                                }
                            });
                        }
                    } else {
                        const cleaned = { ...item };
                        delete cleaned._id;
                        delete cleaned._originTable;
                        delete cleaned._rollTotal;

                        if (!cleaned.system) cleaned.system = {};
                        cleaned.system.level = targetLevel;

                        for (const handler of TALENT_HANDLERS) {
                            if (handler.matches(cleaned) && handler.mutateItem) {
                                handler.mutateItem(cleaned, {
                                    statSelection,
                                    weaponMasterySelection,
                                    armorMasterySelection,
                                    extraSpellSelection
                                });
                            }
                        }
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
                    items.push(cleaned);
                }
            }

            for (const handler of TALENT_HANDLERS) {
                if (handler.resolveItems) {
                    const extraItems = await handler.resolveItems(
                        { statSelection, weaponMasterySelection, armorMasterySelection, extraSpellSelection },
                        targetLevel,
                        fetchByUuid
                    );
                    if (extraItems && extraItems.length > 0) {
                        items.push(...extraItems.map(i => {
                            const c = { ...i };
                            delete c._id;
                            if (!c.system) c.system = {};
                            c.system.level = targetLevel;
                            return c;
                        }));
                    }
                }
            }

            if (activeClassObj && currentLevel === 0) {
                const classBaggage = await resolveGear(activeClassObj, fetchByUuid);
                items.push(...classBaggage);
            }
            if (ancestry && currentLevel === 0) {
                const ancestryBaggage = await resolveGear(ancestry, fetchByUuid);
                items.push(...ancestryBaggage);
            }

            if (activeClassObj && (activeClassObj.uuid !== classObj?.uuid || currentLevel === 0)) {
                const classItem = { ...(activeClassObj.toObject ? activeClassObj.toObject() : activeClassObj), type: 'Class' };
                delete classItem._id;

                // Clean problematic system arrays that cause creation errors
                if (classItem.system) {
                    delete classItem.system.armor;
                    delete classItem.system.weapons;
                    delete classItem.system.talents;
                    delete classItem.system.classAbilities;
                    delete classItem.system.languages; // Helper data, not needed on actor
                    delete classItem.system.titles; // Helper data
                }

                if (!classItem.flags) classItem.flags = {};
                if (!classItem.flags.core) classItem.flags.core = {};
                if (!classItem.flags.core.sourceId) classItem.flags.core.sourceId = activeClassObj.uuid;
                items.push(classItem);
            }

            if (selectedPatronUuid && selectedPatronUuid !== (patron?.uuid || patron?._id)) {
                const fullPatron = await fetchByUuid(selectedPatronUuid);
                if (fullPatron) {
                    const patronItem = { ...(fullPatron.toObject ? fullPatron.toObject() : fullPatron) };
                    delete patronItem._id;
                    if (!patronItem.flags) patronItem.flags = {};
                    if (!patronItem.flags.core) patronItem.flags.core = {};
                    if (!patronItem.flags.core.sourceId) patronItem.flags.core.sourceId = selectedPatronUuid;
                    items.push(patronItem);
                }
            }

            const finalLanguageUuids = Array.from(selectedLanguages);

            // Apply Handlers (mutateItem) to ALL items (Class, Ancestry, Talents, etc)
            // This ensures standard effects are polyfilled using the 'missing-effects' handler
            // avoiding manual ad-hoc fixes and keeping logic centralized in talent-handlers.ts
            for (const item of items) {
                for (const handler of TALENT_HANDLERS) {
                    if (handler.matches(item) && handler.mutateItem) {
                        try {
                            handler.mutateItem(item, {
                                statSelection,
                                weaponMasterySelection,
                                armorMasterySelection,
                                extraSpellSelection,
                                targetLevel
                            });
                        } catch (e) {
                            logger.error(`[LevelUp] Error applying handler ${handler.id} to ${item.name}`, e);
                        }
                    }
                }
            }

            // Verify Handler Results
            logger.info("[LevelUp] Handler Loop Complete. Inspecting Item Effects:");
            items.forEach((i: any) => {
                logger.info(`- Item: ${i.name} (ID: ${i._id})`);
                if (i.effects) {
                    logger.info(`  Effects: ${JSON.stringify(i.effects)}`);
                } else {
                    logger.info(`  Effects: <undefined>`);
                }
            });

            // Final Sanitization of ALL items
            // This catches Ancestry, Background, and any other items that might have helper arrays
            // which Foundry tries to validate as Embedded Collections (causing _id errors)
            // AND catches any remaining "text" items
            const sanitizedItems = items.map((item: any) => {
                const clean = { ...item };

                // 1. Fix "text" types that slipped through
                if (clean.type === 'text' || clean.type == 0) {
                    clean.type = 'Talent';
                    clean.img = clean.img || "icons/svg/item-bag.svg";
                    clean.system = {};
                }

                // 2. Remove problematic system arrays that are just strings (Generic Approach)
                if (clean.system) {
                    Object.keys(clean.system).forEach(key => {
                        const val = clean.system[key];
                        if (Array.isArray(val)) {
                            // Check if it contains strings (or is empty, which implies we don't need it if it was a collection)
                            // Note: Empty arrays might be fine, but if it was meant to be a collection of Embedded Options, 
                            // removing it is generally safe for creation as we are resolved.
                            if (val.length === 0 || typeof val[0] === 'string') {
                                delete clean.system[key];
                            }
                        }
                    });
                }

                return clean;
            });

            const data = {
                hpRoll: (hpRoll as any)?.total ?? hpRoll,
                gold: (goldRoll as any)?.total ?? goldRoll,
                items: sanitizedItems,
                languages: finalLanguageUuids,
                targetLevel
            };

            logger.info('[useLevelUp] Completing Level Up with Sanitized Data:', data);
            onComplete(data);
        } catch (e: any) {
            setError(e.message);
            setIsSubmitting(false);
            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
        }
    };

    // Initialization and Sync logic
    useEffect(() => {
        const init = async () => {
            let currentClass = activeClassObj;
            let effectiveClassUuid: string | undefined = targetClassUuid || classUuid;
            let classLoaded = Boolean(currentClass);

            logger.debug("[LevelUp] Init loop starting", {
                hasActiveClass: !!activeClassObj,
                hasPropClass: !!classObj,
                targetClassUuid,
                classUuid,
                token: !!token
            });

            try {
                // Initial state check - if we have nothing, we are in READY state for selection
                if (!targetClassUuid && currentLevel === 0 && !classObj && !classUuid) {
                    logger.debug("[LevelUp] Empty state, waiting for selection");
                    if (activeClassObj !== null) setActiveClassObj(null);
                    setStatuses(prev => {
                        if (prev.class === 'READY') return prev;
                        return { ...prev, class: 'READY' };
                    });
                    return;
                }

                // If we have a local class object from props but state is empty, use it immediately
                if (!currentClass && classObj) {
                    currentClass = { ...classObj };
                    setActiveClassObj(currentClass);
                    classLoaded = true;
                } else if (currentClass) {
                    classLoaded = true;
                }

                // Determine if we MUST fetch from server (state mismatch or missing)
                const currentUuid = currentClass?.uuid || currentClass?._id;

                // Helper to normalize UUID comparison
                const isMatch = (val1: string, val2: string) => {
                    if (!val1 || !val2) return false;
                    if (val1 === val2) return true;
                    if (val1.endsWith(val2) || val2.endsWith(val1)) return true;
                    return false;
                };

                const matchesTarget = targetClassUuid && isMatch(currentUuid, targetClassUuid);
                const matchesInitial = !targetClassUuid && isMatch(currentUuid, classUuid);

                const needsFetch = !classLoaded && (targetClassUuid || classUuid);

                if (needsFetch) {
                    // We must wait for token for any server-side document fetch
                    if (!token) {
                        setStatuses(prev => {
                            if (prev.class === 'LOADING') return prev;
                            return { ...prev, class: 'LOADING' };
                        });
                        return;
                    }

                    if (statuses.class !== 'LOADING') setStatuses(prev => ({ ...prev, class: 'LOADING' }));
                    const fetchUuid = targetClassUuid || classUuid;

                    // Specific logic for availableClasses searching if it's a targetClassUuid
                    let searchUuid = fetchUuid;
                    if (targetClassUuid) {
                        const targetClassFromList = availableClasses.find((c: any) => (c.uuid === targetClassUuid) || (c._id === targetClassUuid));
                        if (targetClassFromList) {
                            if (targetClassFromList.pack) searchUuid = `Compendium.${targetClassFromList.pack}.${targetClassFromList._id}`;
                            else if (!targetClassFromList.uuid && targetClassFromList._id) searchUuid = `Compendium.shadowdark.classes.${targetClassFromList._id}`;
                        }
                    }
                    const cls = await fetchDocument(searchUuid);

                    if (cls) {
                        logger.debug("[LevelUp] Successfully fetched class:", cls.name);
                        currentClass = cls;
                        setActiveClassObj(cls);
                        if (cls.uuid) effectiveClassUuid = cls.uuid;
                        classLoaded = true;
                    } else {
                        // If fetch failed, we can't proceed with LOADING state
                        logger.error("[LevelUp] Failed to fetch class document:", searchUuid);
                        // Only error if we literally have no class data at all
                        if (!currentClass) {
                            setError("Failed to load class data. Please check your connection.");
                            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
                            return;
                        }
                    }
                }

                // Authenticated Data fetches (Needs Token and a valid Class)
                if (token && classLoaded && currentClass) {
                    logger.debug("[LevelUp] Triggering authenticated data fetches...");
                    if (actorId || effectiveClassUuid) {
                        await fetchLevelUpData(effectiveClassUuid);
                    }

                    if (currentClass?.system?.classTalentTable) {
                        // Sanitize UUID - Foundry sometimes includes .RollTable incorrectly
                        let tableUuid = currentClass.system.classTalentTable;
                        if (tableUuid.includes('.RollTable.')) {
                            tableUuid = tableUuid.replace('.RollTable.', '.');
                        }
                        setTalentTable(tableUuid);
                    }

                    const requiresPatron = Boolean(currentClass.system?.patron?.required || currentClass.system?.patron?.requiredBoon);

                    // --- Pre-fetch Patrons if needed ---
                    if (requiresPatron && availablePatrons.length === 0) {
                        try {
                            setStatuses(prev => ({ ...prev, patron: 'LOADING' }));
                            const response = await fetch('/api/system/data', {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const data = await response.json();
                            setAvailablePatrons(data.patrons || []);
                            setStatuses(prev => ({ ...prev, patron: 'READY' }));
                        } catch (e) {
                            setStatuses(prev => ({ ...prev, patron: 'ERROR' }));
                        }
                    } else if (!requiresPatron) {
                        // Ensure patron status doesn't block UI if not required
                        setStatuses(prev => {
                            if (prev.patron === 'DISABLED') return prev;
                            return { ...prev, patron: 'DISABLED' };
                        });
                    }

                    // Advancement Logic
                    const isOddLevel = targetLevel % 2 !== 0;
                    let reqBoons = 0;
                    let choices = 0;
                    let talentTotal = isOddLevel ? 1 : 0;

                    if (requiresPatron) {
                        setNeedsBoon(true);
                        if (targetLevel === 1) {
                            reqBoons = 1; talentTotal = 0;
                        } else if (isOddLevel) {
                            choices = 1; talentTotal = 0;
                        } else {
                            talentTotal = 0;
                        }

                        const patronUuidToFetch = selectedPatronUuid || patronUuid || currentClass.system?.patron?.uuid;
                        if (patronUuidToFetch) {
                            const fullPatron = await fetchDocument(patronUuidToFetch);
                            if (fullPatron) {
                                setFetchedPatron(fullPatron);
                                if (fullPatron.system?.boonTable) {
                                    // Sanitize UUID - Foundry sometimes includes .RollTable incorrectly
                                    let tableUuid = fullPatron.system.boonTable;
                                    if (tableUuid.includes('.RollTable.')) {
                                        tableUuid = tableUuid.replace('.RollTable.', '.');
                                    }
                                    setBoonTable(tableUuid);
                                }
                            }
                        }
                    } else {
                        setNeedsBoon(false);
                    }

                    setStartingBoons(reqBoons);
                    setChoiceRolls(choices);

                    if (actorId) {
                        const actorDoc = await fetchDocument(`Actor.${actorId}`);
                        if (actorDoc?.items) {
                            setExistingItems(actorDoc.items);
                            for (const handler of TALENT_HANDLERS) {
                                if (handler.onInit) {
                                    const res = handler.onInit({ actor: actorDoc, targetLevel });
                                    if (res.requiredTalents) talentTotal += res.requiredTalents;
                                }
                            }
                        }
                    }
                    setRequiredTalents(talentTotal);
                }

                // Reset selections on init (safe to do even without token/API)
                // Only if everything is settled
                if (classLoaded) {
                    setStatSelection(prev => (prev.required === 0 && prev.selected.length === 0) ? prev : { required: 0, selected: [] });
                    setWeaponMasterySelection(prev => (prev.required === 0 && prev.selected.length === 0) ? prev : { required: 0, selected: [] });
                    setArmorMasterySelection(prev => (prev.required === 0 && prev.selected.length === 0) ? prev : { required: 0, selected: [] });
                }

            } catch (error: any) {
                console.error("Error in LevelUpModal init:", error);
                setError(error.message || "An unexpected error occurred during initialization.");
                setStatuses(prev => ({ ...prev, class: 'ERROR' }));
            } finally {
                // Final status determination - Only set to COMPLETE if we didn't error
                if (classLoaded) {
                    setStatuses(prev => {
                        // Avoid redundant updates to prevent effect loops
                        if (prev.class === 'ERROR') return prev; // Preserve error
                        if (prev.class === 'COMPLETE' && prev.hp === 'IDLE' && prev.extraSpells === 'DISABLED') return prev;

                        return {
                            ...prev,
                            class: 'COMPLETE',
                            hp: prev.hp === 'LOADING' || prev.hp === 'COMPLETE' ? prev.hp : 'IDLE',
                            gold: currentLevel === 0 ? (prev.gold === 'COMPLETE' ? 'COMPLETE' : 'IDLE') : 'DISABLED',
                            languages: targetLevel === 1 ? (prev.languages === 'COMPLETE' ? 'COMPLETE' : 'IDLE') : 'DISABLED',
                            extraSpells: 'DISABLED'
                        };
                    });
                }
            }
        };
        init();
    }, [classObj, actorId, targetLevel, targetClassUuid, selectedPatronUuid, patronUuid, availableClasses, availablePatrons, classUuid, currentLevel, fetchDocument, fetchLevelUpData, token, activeClassObj]);

    // Fetch Extra Spells if needed
    useEffect(() => {
        if (extraSpellSelection.active && extraSpellsList.length === 0) {
            const fetchSpells = async () => {
                try {
                    const headers: any = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    const res = await fetch(`/api/modules/shadowdark/spells/list?source=${extraSpellSelection.source}`, { headers });
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
    }, [extraSpellSelection.active, extraSpellSelection.source, extraSpellsList.length, token]);



    useEffect(() => {
        if (activeClassObj) {
            // Check skip first
            if (skipLanguageSelection) {
                setLanguageGroups([]);
                setFixedLanguages([]);
                return;
            }


            // Only allow language selection at Level 1 (or 0 -> 1)
            if (targetLevel === 1 || currentLevel === 0) {
                const langData = activeClassObj.system?.languages || { common: 0, fixed: [], rare: 0, select: 0 };
                const groups = [];
                setFixedLanguages(langData.fixed || []);
                setSelectedLanguages(prev => Array.from(new Set([...prev, ...(langData.fixed || [])])));

                if (langData.select > 0) groups.push({ id: 'select', label: 'Class Selection', count: langData.select, options: langData.selectOptions });
                if (langData.common > 0) groups.push({ id: 'common', label: 'Common Languages', count: langData.common });
                if (langData.rare > 0) groups.push({ id: 'rare', label: 'Rare Languages', count: langData.rare });
                setLanguageGroups(groups);
            } else {
                setLanguageGroups([]);
                setFixedLanguages([]);
            }
        }
    }, [activeClassObj, targetLevel, currentLevel, skipLanguageSelection]);

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
    }, [targetClassUuid, classUuid]);

    // Validation
    const isComplete = useCallback(() => {
        // 1. Talents
        for (const handler of TALENT_HANDLERS) {
            if (handler.isBlocked && handler.isBlocked({
                talents: rolledTalents,
                requiredTalents,
                targetLevel,
                actor: null,
                existingItems,
                statSelection,
                weaponMasterySelection,
                armorMasterySelection,
                activeClassObj
            })) return false;
        }

        if (rolledTalents.length < requiredTalents) return false;

        // 2. Boons
        if (needsBoon && rolledBoons.length < startingBoons + choiceRolls) return false;

        // 3. Stats
        if (statSelection.required > 0 && statSelection.selected.length < statSelection.required) return false;

        // 4. Weapon Mastery
        if (weaponMasterySelection.required > 0 && weaponMasterySelection.selected.length < weaponMasterySelection.required) return false;

        // 5. Armor Mastery
        if (armorMasterySelection.required > 0 && armorMasterySelection.selected.length < armorMasterySelection.required) return false;

        // 6. Extra Spells
        if (extraSpellSelection.active) {
            if (extraSpellSelection.selected.length < 1) return false;
        }

        // 7. Languages
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

        // 8. Spells
        if (isSpellcaster && spellsToChooseTotal > 0 && availableSpells && availableSpells.length > 0) {
            if (selectedSpells.length < spellsToChooseTotal) return false;
            for (const [tier, count] of Object.entries(spellsToChoose)) {
                const selectedInTier = selectedSpells.filter(s => Number(s.tier || s.system?.tier || 0) === Number(tier)).length;
                if (selectedInTier < count) return false;
            }
        }

        // 9. Pending Choices (from Instruction Items)
        if (pendingChoices) return false;

        // 10. HP & Gold (Block if not set)
        if (targetLevel > 0 && hpRoll === null) return false;
        if (targetLevel === 1 && goldRoll === null) return false;

        return true;
    }, [
        rolledTalents, requiredTalents, targetLevel, existingItems, statSelection, weaponMasterySelection, armorMasterySelection, activeClassObj,
        needsBoon, rolledBoons, startingBoons, choiceRolls,
        extraSpellSelection,
        languageGroups, availableLanguages, fixedLanguages, selectedLanguages, knownLanguages,
        isSpellcaster, spellsToChooseTotal, availableSpells, selectedSpells, spellsToChoose,
        pendingChoices,
        hpRoll, goldRoll
    ]);

    // HP Formula & Max
    // HP Formula & Max Sync
    useEffect(() => {
        if (!activeClassObj) return;
        const hitDieStr = String(activeClassObj.system?.hitPoints || "d6");

        // Extract die value (e.g. from "1d6", "d6", "6")
        const dieMatch = hitDieStr.match(/d?(\d+)/);
        const dieVal = dieMatch ? parseInt(dieMatch[1]) : 6;

        let baseDie = `1d${dieVal}`;
        const formula = baseDie;
        const max = dieVal; // Max is just the die face value

        // Only update if changed (and not currently rolling/set by API)
        setHpFormula(prev => prev === formula ? prev : formula);
        setHpMax(max);
    }, [activeClassObj, _abilities]);

    const goldFormula = "2d6 x 5";
    const goldMax = 90;

    return {
        state: {
            targetLevel,
            statuses,
            error,
            isSubmitting,
            activeClassObj,
            rolledTalents,
            rolledBoons,
            hpRoll,
            goldRoll,
            statSelection,
            weaponMasterySelection,
            armorMasterySelection,
            extraSpellSelection,
            isComplete,
            hpFormula,
            hpMax,
            goldFormula,
            goldMax,
            fetchedPatron,
            selectedPatronUuid,
            availablePatrons,
            loadingPatrons: statuses.patron === 'LOADING',
            pendingChoices,
            selectedLanguages,
            fixedLanguages,
            knownLanguages,
            languageGroups,
            boonTable,
            availableSpells,
            selectedSpells,
            spellsToChoose,
            spellsToChooseTotal,
            isSpellcaster,
            requiredTalents,
            needsBoon,
            startingBoons,
            choiceRolls,
            extraSpellsList,
            // Add missing properties that were previously there if needed by other components
            // activeClassObj is already there.
            loading: Object.values(statuses).some(s => s === 'LOADING'),
            loadingClass: statuses.class === 'LOADING',
            confirmReroll,
            targetClassUuid,
            talentTable
        },
        actions: {
            handleRollHP,
            handleRollGold,
            handleRollTalent,
            handleStatToggle,
            setWeaponMasterySelection,
            setArmorMasterySelection,
            setExtraSpellSelection,
            handleConfirm,
            handleChoiceSelection,
            setTargetClassUuid,
            setSelectedPatronUuid,
            setHpRoll,
            setGoldRoll,
            setConfirmReroll,
            setError,
            setRolledTalents,
            setRolledBoons,
            setSelectedSpells,
            handleRollBoon,
            setSelectedLanguages,
            isComplete // Expose isComplete in actions as well for signature match
        }
    };
};
