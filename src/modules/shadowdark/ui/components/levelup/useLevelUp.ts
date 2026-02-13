import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSpellcaster, getSpellcastingClass, isClassSpellcaster } from '../../../rules';
import { logger } from '@/app/ui/logger';
import { resolveGear } from './gear-resolver';
import { resolveBaggage } from './baggage-resolver';
import { TALENT_HANDLERS } from '@/modules/shadowdark/api/talent-handlers';

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
    const [statPool, setStatPool] = useState<{ total: number; allocated: Record<string, number>; talentIndex: number | null }>({ total: 0, allocated: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, talentIndex: null });
    const [weaponMasterySelection, setWeaponMasterySelection] = useState<{ required: number; selected: string[] }>({ required: 0, selected: [] });
    const [armorMasterySelection, setArmorMasterySelection] = useState<{ required: number; selected: string[] }>({ required: 0, selected: [] });
    const [extraSpellSelection, setExtraSpellSelection] = useState<{ active: boolean; maxTier: number; source: string; selected: any[] }>({ active: false, maxTier: 0, source: 'Wizard', selected: [] });
    const [extraSpellsList, setExtraSpellsList] = useState<any[]>([]);

    const [isSpellcaster, setIsSpellcaster] = useState(false);
    useEffect(() => {
        if (activeClassObj) {
            setIsSpellcaster(isClassSpellcaster(activeClassObj));
        }
    }, [activeClassObj]);

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
            logger.error("SimpleRoll Error", e);
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
            logger.error("Failed to fetch level up data", e);
            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
        }
    }, [actorId, token]);

    const handleRollHP = async (isReroll = false) => {
        setStatuses(prev => ({ ...prev, hp: 'LOADING' }));
        setError(null);
        try {
            // Prefer the UUID of the loaded class object, or the target selection, or the prop
            const cId = activeClassObj?.uuid || targetClassUuid || classUuid;

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
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-talent`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tableUuidOrName: talentTable,
                    targetLevel
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to roll talent');
            }

            const data = await res.json();
            const { item, needsChoice, choiceOptions } = data;

            if (needsChoice) {
                setPendingChoices({
                    header: item?.name || "Select an Option",
                    options: choiceOptions,
                    context: 'talent'
                });
            } else if (item) {
                setRolledTalents(prev => [...prev, item]);
            } else {
                // Item was filtered out or invalid
                setError("Rolled an invalid result (likely 'OR' or empty). Please roll again.");
                setStatuses(prev => ({ ...prev, talents: 'READY' }));
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

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-boon`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tableUuidOrName: boonTable,
                    targetLevel
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to roll boon');
            }

            const data = await res.json();
            const { item, needsChoice, choiceOptions } = data;

            if (needsChoice) {
                setPendingChoices({
                    header: item?.name || "Select an Option",
                    options: choiceOptions,
                    context: 'boon'
                });
            } else if (item) {
                setRolledBoons(prev => [...prev, item]);
            } else {
                // Item was filtered out or invalid
                setError("Rolled an invalid boon result. Please roll again.");
                setStatuses(prev => ({ ...prev, boons: 'READY' }));
            }
        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, boons: 'ERROR' }));
        }
    };
    const handleChoiceSelection = async (choiceOrResult: any) => {
        // Handle closing/cancellation
        if (!choiceOrResult) {
            setPendingChoices(null);
            setStatuses(prev => ({
                ...prev,
                talents: prev.talents === 'LOADING' ? 'READY' : prev.talents,
                boons: prev.boons === 'LOADING' ? 'READY' : prev.boons
            }));
            return;
        }

        const raw = choiceOrResult.original || choiceOrResult;
        const context = pendingChoices?.context || 'talent';
        const replaceIndex = pendingChoices?.replaceIndex;
        setPendingChoices(null);

        // Special handling for Distribute to Stats (Table Result)
        // As per user feedback, we can trust the name "Distribute to Stats" to be the specific table.
        const isDistribute = raw.name === "Distribute to Stats";

        setStatuses(prev => ({
            ...prev,
            [context === 'boon' ? 'boons' : 'talents']: 'LOADING'
        }));

        try {
            // If it's a RollTable AND NOT Distribute to Stats, roll on it
            if (!isDistribute && (raw.type === 'RollTable' || raw.documentCollection === 'RollTable' || raw.documentType === 'RollTable')) {
                const uuid = raw.documentUuid || raw.uuid || `Compendium.${raw.collection}.${raw.documentId}`;
                const headers: any = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-talent`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        tableUuidOrName: uuid,
                        targetLevel
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const { item, needsChoice, choiceOptions } = data;

                    if (needsChoice) {
                        setPendingChoices({
                            header: item?.name || "Select an Option",
                            options: choiceOptions,
                            context,
                            replaceIndex
                        });
                    } else if (item) {
                        if (replaceIndex !== undefined && replaceIndex !== null) {
                            if (context === 'boon') {
                                setRolledBoons(prev => {
                                    const next = [...prev];
                                    if (replaceIndex < next.length) next[replaceIndex] = item;
                                    else return [...prev, item];
                                    return next;
                                });
                            } else {
                                setRolledTalents(prev => {
                                    const next = [...prev];
                                    if (replaceIndex < next.length) next[replaceIndex] = item;
                                    else return [...prev, item];
                                    return next;
                                });
                            }
                        } else {
                            if (context === 'boon') setRolledBoons(prev => [...prev, item]);
                            else setRolledTalents(prev => [...prev, item]);
                        }
                    }
                }
            } else {
                // Direct item selection (including Distribute to Stats)
                if (replaceIndex !== undefined && replaceIndex !== null) {
                    if (context === 'boon') {
                        setRolledBoons(prev => {
                            const next = [...prev];
                            if (replaceIndex < next.length) next[replaceIndex] = raw;
                            else return [...prev, raw];
                            return next;
                        });
                    } else {
                        setRolledTalents(prev => {
                            const next = [...prev];
                            if (replaceIndex < next.length) next[replaceIndex] = raw;
                            else return [...prev, raw];
                            return next;
                        });
                    }
                } else {
                    if (context === 'boon') setRolledBoons(prev => [...prev, raw]);
                    else setRolledTalents(prev => [...prev, raw]);
                }
            }
        } catch (e: any) {
            setError(e.message || "Failed to resolve choice");
        } finally {
            setStatuses(prev => ({
                ...prev,
                [context === 'boon' ? 'boons' : 'talents']: 'READY'
            }));
        }
    };



    const handleResetTalents = () => {
        setRolledTalents([]);
        setRolledBoons([]);
        setError(null);
    };

    const handleResolveNested = async (index: number, item: any, context: 'talent' | 'boon') => {
        setStatuses(prev => ({
            ...prev,
            [context === 'boon' ? 'boons' : 'talents']: 'LOADING'
        }));

        try {
            const uuid = item.documentUuid || item.uuid || item._id;
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/roll-talent`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tableUuidOrName: uuid,
                    targetLevel
                })
            });

            if (res.ok) {
                const data = await res.json();
                const { item: resultItem, needsChoice, choiceOptions } = data;

                if (needsChoice) {
                    setPendingChoices({
                        header: resultItem?.name || "Select an Option",
                        options: choiceOptions,
                        context,
                        replaceIndex: index
                    });
                } else if (resultItem) {
                    if (context === 'boon') {
                        setRolledBoons(prev => {
                            const next = [...prev];
                            next[index] = resultItem;
                            return next;
                        });
                    } else {
                        setRolledTalents(prev => {
                            const next = [...prev];
                            next[index] = resultItem;
                            return next;
                        });
                    }
                }
            }
        } catch (e: any) {
            setError(e.message || "Failed to resolve nested table");
        } finally {
            setStatuses(prev => ({
                ...prev,
                [context === 'boon' ? 'boons' : 'talents']: 'READY'
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

    const handleStatPoolChange = (stat: string, delta: number) => {
        setStatPool(prev => {
            const currentVal = prev.allocated[stat] || 0;
            const newVal = Math.max(0, currentVal + delta);
            const totalUsed = Object.values(prev.allocated).reduce((a: number, b: any) => a + (Number(b) || 0), 0) - currentVal + newVal;

            if (totalUsed > prev.total) return prev;

            return {
                ...prev,
                allocated: { ...prev.allocated, [stat]: newVal }
            };
        });
    };

    const handleRemoveTalent = (index: number) => {
        setRolledTalents(prev => prev.filter((_, i) => i !== index));

        // Sync statPool
        if (statPool.talentIndex === index) {
            setStatPool({ total: 0, allocated: {}, talentIndex: null });
        } else if (statPool.talentIndex !== null && statPool.talentIndex > index) {
            setStatPool(prev => ({ ...prev, talentIndex: prev.talentIndex! - 1 }));
        }

        // Cleanup other selections (one per level-up usually)
        if (weaponMasterySelection.required > 0) setWeaponMasterySelection({ required: 0, selected: [] });
        if (armorMasterySelection.required > 0) setArmorMasterySelection({ required: 0, selected: [] });
        if (extraSpellSelection.active) setExtraSpellSelection({ active: false, maxTier: 0, source: '', selected: [] });
    };

    const handleRemoveBoon = (index: number) => {
        setRolledBoons(prev => prev.filter((_, i) => i !== index));
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setStatuses(prev => ({ ...prev, class: 'LOADING' }));
        try {
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/modules/shadowdark/actors/${actorId || 'new'}/level-up/finalize`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    targetLevel,
                    classUuid: targetClassUuid,
                    ancestryUuid: ancestry?.uuid,
                    patronUuid: selectedPatronUuid,
                    rolledTalents,
                    rolledBoons,
                    selectedSpells,
                    hpRoll,
                    gold: goldRoll,
                    languages: selectedLanguages,
                    statSelection,
                    statPool,
                    weaponMasterySelection,
                    armorMasterySelection,
                    extraSpellSelection
                })
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to finalize level-up');
            }

            onComplete({
                items: json.items || [],
                hpRoll: json.hpRoll || hpRoll || 0,
                gold: json.goldRoll || goldRoll || 0,
                languages: selectedLanguages
            });

        } catch (e: any) {
            setError(e.message);
            setStatuses(prev => ({ ...prev, class: 'ERROR' }));
        } finally {
            setIsSubmitting(false);
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
                logger.error("Error in LevelUpModal init:", error);
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
                    logger.error("Failed to fetch extra spells", e);
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

    // Sync Stat Pool and Selection based on rolled talents
    // Sync UI state based on rolled talents/boons
    useEffect(() => {
        let poolTotal = 0;
        let selectionReq = 0;
        let talentIndex: number | null = null;
        let hasDist = false;

        let wmReq = 0;
        let amReq = 0;

        let esActive = false;
        let esSource = 'Wizard';

        const processItem = (item: any, index: number | null) => {
            const handler = TALENT_HANDLERS.find(h => h.matches(item));
            if (handler?.action) {
                switch (handler.action) {
                    case 'stat-pool':
                        poolTotal += handler.config?.total || 0;
                        if (index !== null) {
                            talentIndex = index;
                            hasDist = true;
                        }
                        break;
                    case 'stat-selection':
                        selectionReq += handler.config?.required || 0;
                        break;
                    case 'weapon-mastery':
                        wmReq += handler.config?.required || 0;
                        break;
                    case 'armor-mastery':
                        amReq += handler.config?.required || 0;
                        break;
                    case 'extra-spell':
                        esActive = true;

                        // Attempt to infer source class from item name
                        const name = (item.name || "").toLowerCase();
                        const classes = ['wizard', 'priest', 'witch', 'warlock', 'ranger', 'bard', 'druid'];
                        for (const cls of classes) {
                            if (name.includes(cls)) {
                                esSource = cls.charAt(0).toUpperCase() + cls.slice(1);
                                break;
                            }
                        }
                        break;
                }
            }
        };

        rolledTalents.forEach((item, index) => processItem(item, index));
        rolledBoons.forEach((item) => processItem(item, null));

        setStatPool(prev => {
            if (prev.total !== poolTotal) {
                return {
                    total: poolTotal,
                    allocated: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
                    talentIndex
                };
            }
            if (prev.talentIndex !== talentIndex && hasDist) {
                return { ...prev, talentIndex };
            }
            return prev;
        });

        setStatSelection(prev => {
            if (prev.required !== selectionReq) {
                return { required: selectionReq, selected: [] };
            }
            return prev;
        });

        setWeaponMasterySelection(prev => {
            if (prev.required !== wmReq) {
                return { required: wmReq, selected: [] };
            }
            return prev;
        });

        setArmorMasterySelection(prev => {
            if (prev.required !== amReq) {
                return { required: amReq, selected: [] };
            }
            return prev;
        });

        setExtraSpellSelection(prev => {
            if (prev.active !== esActive || (esActive && prev.source !== esSource)) {
                if (!esActive) return { active: false, maxTier: 0, source: 'Wizard', selected: [] };

                const level = targetLevel || 1;
                const maxTier = Math.min(5, Math.ceil(level / 2));
                return {
                    active: true,
                    maxTier,
                    source: esSource,
                    selected: []
                };
            }
            return prev;
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
                statPool,
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

        // 5b. Stat Pool (Distribution)
        if (statPool.total > 0) {
            const used = Object.values(statPool.allocated).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
            if (used < statPool.total) return false;
        }

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
        rolledTalents, requiredTalents, targetLevel, existingItems, statSelection, statPool, weaponMasterySelection, armorMasterySelection, activeClassObj,
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
    const goldMax = 60;

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
            statPool,
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
            handleRemoveTalent,
            handleRemoveBoon,
            setSelectedLanguages,
            handleStatPoolChange,
            handleResetTalents,
            handleResolveNested,
            isComplete // Expose isComplete in actions as well for signature match
        }
    };
};
