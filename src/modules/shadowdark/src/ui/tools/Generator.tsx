'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import { LevelUpModal } from '../components/LevelUpModal';
import { logger } from '@shared/utils/logger';
import { useConfig } from '@client/ui/context/ConfigContext';
import { TALENT_HANDLERS } from '@modules/shadowdark/src/logic/talent-handlers';
import { useShadowdarkUI, ShadowdarkUIProvider } from '../context/ShadowdarkUIContext';
import { useFoundry } from '@client/ui/context/FoundryContext';
import LoadingModal from '@client/ui/components/LoadingModal';
import { enrichItem, resolveSubItems, EnrichmentContext } from '@modules/shadowdark/src/logic/actor-enricher';

export default function Generator() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sheet-delver-token') : null;

    return (
        <ShadowdarkUIProvider token={token}>
            <GeneratorContent />
        </ShadowdarkUIProvider>
    );
}

function GeneratorContent() {
    const { systemData, collections, fetchPack, resolveName, resolveUuid, loadingSystem } = useShadowdarkUI();
    const { step, system, token: foundryToken } = useFoundry();
    const { setFoundryUrl: setConfigFoundryUrl } = useConfig();
    const [loading, setLoading] = useState(true);
    const [foundryUrl, setFoundryUrl] = useState<string>('');
    const [token, setToken] = useState<string | null>(null);

    // Load Token
    useEffect(() => {
        const stored = localStorage.getItem('sheet-delver-token');
        if (stored) setToken(stored);
    }, []);

    const fetchWithAuth = useCallback(async (input: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const currentToken = token || localStorage.getItem('sheet-delver-token');
        if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
        return fetch(input, { ...init, headers });
    }, [token]);

    // Randomize All
    const skipLanguageReset = useRef(false);
    const skipTalentReset = useRef(false);

    // Stat Choice State
    const [currentStatPrompt, setCurrentStatPrompt] = useState<{
        resolve: (value: string) => void;
        amount: number;
    } | null>(null);

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
        title: '',
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
    const promptStatChoice = (amount: number): Promise<string> => {
        return new Promise((resolve) => {
            setCurrentStatPrompt({ resolve, amount });
        });
    };

    const handleStatSelect = (stat: string) => {
        if (currentStatPrompt) {
            currentStatPrompt.resolve(stat);
            setCurrentStatPrompt(null);
        }
    };

    const handleStatChange = (stat: string, valueStr: string) => {
        const val = parseInt(valueStr) || 10;
        // Clamp 1-18 (3d6 max) as requested
        const clamped = Math.max(1, Math.min(18, val));

        setFormData(prev => ({
            ...prev,
            stats: {
                ...prev.stats,
                // @ts-ignore
                [stat]: {
                    // @ts-ignore
                    ...prev.stats[stat],
                    value: clamped,
                    mod: getMod(clamped)
                }
            }
        }));
    };

    const fetchDocument = useCallback(async (uuid: string) => {
        // 1. Check loaded shards
        for (const shard of Object.values(collections)) {
            const found = shard.find((i: any) => i.uuid === uuid || i.id === uuid || i._id === uuid);
            if (found) return found;
        }

        // 2. Check systemData collections (Lean Index)
        if (systemData) {
            for (const category of Object.values(systemData)) {
                if (Array.isArray(category)) {
                    const found = category.find((i: any) => i.uuid === uuid || i.id === uuid || i._id === uuid);
                    if (found) return found;
                }
            }
        }

        // 3. Last Resource: Check Name Index (for simple resolution if possible)
        if (systemData?.nameIndex?.[uuid]) {
            return { uuid, name: systemData.nameIndex[uuid], type: 'Unknown' };
        }

        // 4. Fallback to network
        try {
            const res = await fetchWithAuth(`/api/modules/shadowdark/document/${uuid}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            logger.error(`Failed to fetch document ${uuid}:`, e);
            return null;
        }
    }, [fetchWithAuth, collections, systemData]);

    // Verify Connection on Mount
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const res = await fetchWithAuth('/api/session/connect');
                const data = await res.json();



                // Only redirect if we are CERTAIN we shouldn't be here.
                // If it's just 'startup' or 'initializing', we wait.
                const isBadState = !data.isAuthenticated || (data.system && data.system.id !== 'shadowdark');
                const isSetupMode = data.system?.id === 'setup';
                
                if (isBadState || isSetupMode) {
                    // Only redirect if we aren't already waiting for a world to start
                    if (data.system?.status !== 'startup' && data.system?.status !== 'initializing') {
                        window.location.href = '/';
                    }
                }
                if (data.url) {
                    setFoundryUrl(data.url);
                    setConfigFoundryUrl(data.url);
                } else {
                    logger.warn('Generator: No foundryUrl returned from connect');
                }
            } catch {
                window.location.href = '/';
            }
        };
        checkConnection();
    }, [fetchWithAuth, setConfigFoundryUrl]);

    // Load Shards and Index
    useEffect(() => {
        const loadRequiredData = async () => {
            try {
                setLoading(true);
                // Fetch Identity Shards needed for Character Creation
                await Promise.all([
                    fetchPack('ancestries'),
                    fetchPack('classes'),
                    fetchPack('backgrounds'),
                    fetchPack('deities'),
                    fetchPack('patrons'),
                    fetchPack('languages')
                ]);
                setLoading(false);
            } catch (err) {
                logger.error("Failed to load character creation shards:", err);
                setLoading(false);
            }
        };

        if (token) loadRequiredData();
    }, [token, fetchPack]);

    // Consolidated Readiness Logic
    const isAppLoading = loading || loadingSystem || !systemData || !collections.ancestries;
    const isCoreReady = step === 'dashboard' && system?.status === 'active';

    // Handle initial loading state sync
    useEffect(() => {
        if (systemData && collections.ancestries && isCoreReady) {
            setLoading(false);
        }
    }, [systemData, collections.ancestries, isCoreReady]);



    // Fetch Class Details on change
    useEffect(() => {
        if (!formData.class) {
            setClassDetails(null);
            return;
        }

        // Only fetch if it's actually different from what we have
        if (classDetails && (classDetails.uuid === formData.class || classDetails._id === formData.class)) {
            return;
        }

        fetchDocument(formData.class).then(data => {
            setClassDetails(data);
        });
    }, [formData.class, classDetails, fetchDocument]);

    // Fetch Patron Details on change
    useEffect(() => {
        if (!formData.patron) {
            setPatronDetails(null);
            return;
        }
        fetchDocument(formData.patron).then(data => setPatronDetails(data));
    }, [formData.patron, fetchDocument]);







    // Effect 2: Gear & Gold (Level/Class changes)
    useEffect(() => {
        // If Level 0 toggled
        if (formData.level0) {
            setFormData(prev => ({ ...prev, gold: 0 }));
        } else {
            setGearSelected([]);
            // If switching to Level 1, maybe roll gold?
            // Only if gold is 0?
            // calculateGold(); // Randomizes.
            // User might want to keep rolled gold.
        }
    }, [classDetails, formData.level0]);



    // Randomize All
    const [isRandomizing, setIsRandomizing] = useState(false);

    // API Wrappers
    const rollStats = async () => {
        try {
            const res = await fetchWithAuth('/api/modules/shadowdark/actors/randomize/stats', { method: 'POST' });
            const data = await res.json();
            if (data.stats) setFormData(prev => ({ ...prev, stats: data.stats }));
        } catch (e: any) { logger.error(e.message || String(e)); }
    };

    const rollSingleStat = async (stat: string) => {
        try {
            const res = await fetchWithAuth('/api/modules/shadowdark/actors/randomize/stats', { method: 'POST' });
            const data = await res.json();
            if (data.stats && data.stats[stat]) {
                setFormData(prev => ({
                    ...prev,
                    stats: {
                        ...prev.stats,
                        [stat]: data.stats[stat]
                    }
                }));
            }
        } catch (e: any) { logger.error(e.message || String(e)); }
    };

    const rollName = async () => {
        if (!formData.ancestry) return;

        try {
            const res = await fetchWithAuth('/api/modules/shadowdark/actors/randomize/name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ancestryUuid: formData.ancestry })
            });

            if (!res.ok) throw new Error('Name randomization failed');
            const data = await res.json();
            if (data.name) {
                setFormData(prev => ({ ...prev, name: data.name }));
            }
        } catch (e) {
            logger.error("Name randomization error", e);
        }
    };

    const randomizeAll = async () => {
        if (isRandomizing) return;
        setIsRandomizing(true);
        skipLanguageReset.current = true;
        skipTalentReset.current = true;

        try {
            const res = await fetchWithAuth('/api/modules/shadowdark/actors/randomize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level0: formData.level0 })
            });

            if (!res.ok) throw new Error('Randomization failed');
            const data = await res.json();

            // 1. Update Details State (Batch these to ensure Effects see consistent data)
            setAncestryDetails(data.ancestry);
            setClassDetails(data.class);

            // 2. Update Form Data
            setFormData(prev => ({
                ...prev,
                stats: data.stats,
                hp: data.hp || 0,
                gold: data.gold || 0,
                ancestry: data.ancestry?.uuid || '',
                class: data.class?.uuid || '',
                background: data.background?.uuid || '',
                deity: data.deity?.uuid || '',
                alignment: data.alignment?.toLowerCase() || 'neutral',
                patron: data.patron?.uuid || '',
                title: data.title || prev.title,
                name: data.name || prev.name, // Use generated name or keep existing
                // Keep level0 flag as requested
                level0: formData.level0,
            }));

            // 3. Talents
            setSelectedAncestryTalents(data.talents?.ancestry || []);


            // 4. Languages
            if (data.languages) {
                setKnownLanguages({
                    fixed: data.languages.fixed || [],
                    selected: {
                        common: data.languages.selected?.common || [],
                        rare: data.languages.selected?.rare || [],
                        ancestry: data.languages.selected?.ancestry || [],
                        class: data.languages.selected?.class || []
                    }
                });
            }

            // 5. Gear
            setGearSelected(data.gear || []);

        } catch (e) {
            logger.error("Randomization error", e);
        } finally {
            setTimeout(() => {
                setIsRandomizing(false);
                skipLanguageReset.current = false;
                skipTalentReset.current = false;
            }, 1500);
        }
    };

    // Effect: Sync Level 0 HP
    useEffect(() => {
        if (formData.level0) {
            const conMod = formData.stats.CON?.mod || 0;
            const newHp = Math.max(1, 1 + conMod);
            if (formData.hp !== newHp) {
                setFormData(prev => ({ ...prev, hp: newHp }));
            }
        }
    }, [formData.level0, formData.stats.CON?.mod, formData.hp]);

    // Effect: React to Level Toggle
    const lastLevel0 = useRef(formData.level0);
    useEffect(() => {
        if (!collections.classes) return;
        
        const isSwitchingToLevel1 = lastLevel0.current && !formData.level0;
        const isSwitchingToLevel0 = !lastLevel0.current && formData.level0;
        lastLevel0.current = formData.level0;

        if (isSwitchingToLevel0) {
            setFormData(prev => ({ ...prev, class: '' }));
        } else if (isSwitchingToLevel1 && !formData.class) {
            // Pick a random class if level 1 but none selected
            const options = (collections.classes || []).filter((c: any) => c.name !== "Level 0");
            if (options.length > 0) {
                const random = options[Math.floor(Math.random() * options.length)];
                setFormData(prev => ({ ...prev, class: random.uuid }));
            }
        }
    }, [formData.level0, collections.classes, formData.class]);

    // Effect: Load Ancestry Details & Talents & Languages
    useEffect(() => {
        if (!formData.ancestry) {
            setAncestryDetails(null);
            setAncestryTalents({ fixed: [], choice: [], choiceCount: 0 });
            return;
        }

        const loadAncestry = async () => {
            try {
                let details = ancestryDetails;

                // 1. Fetch details if missing or different
                if (!details || (details.uuid !== formData.ancestry && details._id !== formData.ancestry)) {
                    details = await fetchDocument(formData.ancestry);
                    setAncestryDetails(details);
                }

                if (!details?.system) return;

                // 2. TALENTS & TRAITS
                const fixedTalents: any[] = [];
                const choiceTalents: any[] = [];
                const choiceCount = details.system.talentChoiceCount || 0;

                // Use the new centralized resolveSubItems logic
                const enrichmentContext: EnrichmentContext = {
                    addedSourceIds: new Set<string>(),
                    addedNames: new Set<string>(),
                    targetLevel: formData.level0 ? 0 : 1,
                    actor: null
                };

                const subItems = await resolveSubItems(details, fetchDocument, enrichmentContext);
                
                // For the UI, we still want to distinguish between what was added automatically 
                // and what might be a choice.
                // However, resolveSubItems ALREADY filters by choiceCount for ancestries.
                fixedTalents.push(...subItems.map(i => ({
                    uuid: i.flags?.core?.sourceId || i.uuid || i._id,
                    name: i.name,
                    description: (i.system?.description?.value || i.system?.description || "").replace(/<[^>]+>/g, ' ')
                })));

                // In Shadowdark, an ancestry choice only exists if total items > choice count.
                // If total <= choiceCount, all items are fixed base traits.
                const totalTalents = details.system.talents?.length || 0;
                const effectiveChoiceCount = totalTalents > choiceCount ? choiceCount : 0;
                
                if (totalTalents > choiceCount && choiceCount > 0) {
                     try {
                         const choices = await Promise.all(details.system.talents.map((u: string) => fetchDocument(u)));
                         choiceTalents.push(...choices.map((d, i) => d ? {
                             uuid: details.system.talents[i],
                             name: d.name,
                             description: (d.system?.description?.value || d.system?.description || "").replace(/<[^>]+>/g, ' ')
                         } : null).filter(d => d));
                     } catch (e) {
                         logger.error("Ancestry choice load error", e);
                     }
                }

                setAncestryTalents({ fixed: fixedTalents, choice: choiceTalents, choiceCount: effectiveChoiceCount });

            } catch (e) {
                logger.error("Ancestry load error", e);
            }
        };
        loadAncestry();
    }, [formData.ancestry, collections, fetchDocument, ancestryDetails]);




    const [classTalents, setClassTalents] = useState<{ fixed: any[], choice: any[], choiceCount: number, table?: boolean }>({ fixed: [], choice: [], choiceCount: 0 });
    const [ancestryTalents, setAncestryTalents] = useState<{ fixed: any[], choice: any[], choiceCount: number }>({ fixed: [], choice: [], choiceCount: 0 });

    // Gear State
    const [gearSelected, setGearSelected] = useState<any[]>([]);

    // Language State
    // Language State
    const [knownLanguages, setKnownLanguages] = useState<{
        fixed: any[],
        selected: {
            common: string[],
            rare: string[],
            ancestry: string[],
            class: string[]
        }
    }>({
        fixed: [],
        selected: { common: [], rare: [], ancestry: [], class: [] }
    });

    // Config now tracks pools
    const [languageConfig, setLanguageConfig] = useState<{
        common: number,
        rare: number,
        ancestry: { count: number, options: string[] },
        class: { count: number, options: string[] },
        fixed: string[]
    }>({
        common: 0,
        rare: 0,
        ancestry: { count: 0, options: [] },
        class: { count: 0, options: [] },
        fixed: []
    });
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [weaponNames, setWeaponNames] = useState<string[]>([]);
    const [armorNames, setArmorNames] = useState<string[]>([]);

    // Level Up State
    const [showLevelUp, setShowLevelUp] = useState(false);

    useEffect(() => {
        if (!classDetails?.system || formData.level0) {
            setClassTalents({ fixed: [], choice: [], choiceCount: 0 });
            setWeaponNames([]);
            setArmorNames([]);
            return;
        }

        const loadDetails = async () => {
            // 1. TALENTS & ABILITIES
            const enrichmentContext: EnrichmentContext = {
                addedSourceIds: new Set<string>(),
                addedNames: new Set<string>(),
                targetLevel: formData.level0 ? 0 : 1,
                actor: null
            };

            const subItems = await resolveSubItems(classDetails, fetchDocument, enrichmentContext);
            
            const fixed = subItems.map(i => ({
                uuid: i.flags?.core?.sourceId || i.uuid || i._id,
                name: i.name,
                description: (i.system?.description?.value || i.system?.description || "").replace(/<[^>]+>/g, ' ')
            }));

            // Choice Talents (Manual selection table)
            const choice: any[] = [];
            if (classDetails.system.talentChoices?.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.talentChoices.map((u: string) => fetchDocument(u)));
                    choice.push(...docs.map((d, i) => d ? {
                        uuid: classDetails.system.talentChoices[i],
                        name: d.name,
                        description: (d.system?.description?.value || d.system?.description || "").replace(/<[^>]+>/g, ' ')
                    } : null).filter(d => d));
                } catch (e) {
                    logger.error("Talent choice load error", e);
                }
            }

            setClassTalents({ 
                fixed, 
                choice, 
                choiceCount: classDetails.system.talentChoiceCount || 0, 
                table: classDetails.system.classTalentTable || false 
            });

            // 2. Weapons
            if (Array.isArray(classDetails.system.weapons) && classDetails.system.weapons.length > 0) {
                try {
                    const docs = await Promise.all(classDetails.system.weapons.map((u: string) => fetchDocument(u)));
                    setWeaponNames(docs.filter(d => d && d.name).map(d => d.name));
                } catch (e) {
                    logger.error("Weapon load error", e);
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
                    logger.error("Armor load error", e);
                    setArmorNames([]);
                }
            } else {
                setArmorNames([]);
            }
        };

        loadDetails();
    }, [classDetails, formData.level0, fetchDocument]);

    // Combined Language Effect
    useEffect(() => {
        const loadLanguages = async () => {
            let common = 0;
            let rare = 0;
            let fixedUuids: string[] = [];
            const ancestryPool = { count: 0, options: [] as string[] };
            const classPool = { count: 0, options: [] as string[] };

            // 1. INT Mod Bonus
            const intMod = formData.stats.INT?.mod || 0;
            if (intMod > 0) {
                common += intMod;
            }

            // 2. Ancestry
            if (ancestryDetails?.system?.languages) {
                const al = ancestryDetails.system.languages;
                common += (al.common || 0);
                rare += (al.rare || 0);
                if (al.fixed) {
                    fixedUuids.push(...al.fixed);
                }

                // Select / Restricted
                if (al.select > 0) {
                    ancestryPool.count = al.select;
                    if (al.selectOptions?.length > 0) {
                        ancestryPool.options = al.selectOptions;
                    }
                }
            }

            // 3. Class (only if not Level 0)
            if (!formData.level0 && classDetails?.system?.languages) {
                const cl = classDetails.system.languages;
                common += (cl.common || 0);
                rare += (cl.rare || 0);
                if (cl.fixed) {
                    fixedUuids.push(...cl.fixed);
                }

                if (cl.select > 0) {
                    classPool.count = cl.select;
                    if (cl.selectOptions?.length > 0) {
                        classPool.options = cl.selectOptions;
                    }
                }
            }

            // Deduplicate Fixed
            fixedUuids = [...new Set(fixedUuids)];

            // Resolve Fixed Names
            let fixedResolved: any[] = [];
            if (fixedUuids.length > 0) {
                const docs = await Promise.all(fixedUuids.map(u => fetchDocument(u)));
                fixedResolved = docs.map((d, i) => d ? { uuid: fixedUuids[i], name: d.name } : null).filter(d => d);
            }

            setLanguageConfig({ common, rare, ancestry: ancestryPool, class: classPool, fixed: fixedUuids });

            setKnownLanguages(prev => ({
                ...prev,
                fixed: fixedResolved
            }));
        };

        loadLanguages();
    }, [ancestryDetails, classDetails, formData.level0, formData.stats.INT, fetchDocument]);


    const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
    const [creationError, setCreationError] = useState<string | null>(null);

    // Create Character
    const createCharacter = async (extraItems: any[] = [], extraData: any = {}) => {
        setCreationError(null);
        setFormErrors({});

        // Validation
        const errors: Record<string, boolean> = {};
        if (!formData.name) errors.name = true;
        if (!formData.ancestry) errors.ancestry = true;
        if (!formData.background) errors.background = true;
        if (!formData.level0 && !formData.class) errors.class = true;

        // Details Validation
        if (ancestryTalents.choiceCount > 0 && selectedAncestryTalents.length < ancestryTalents.choiceCount) {
            errors.ancestryTalents = true;
        }

        // Language Validation
        // User must select enough languages to meet Common + Rare Points
        // Ideally we track common/rare spending. Current simple UI (which we assume exists or will be verified)
        // just collects 'selected'. If we don't differentiate in UI, we just check total count?
        // Shadowdark rules are loose, usually "Common + 2 others".
        // Let's check total count vs total points.
        const totalPoints = languageConfig.common + languageConfig.rare + languageConfig.ancestry.count + languageConfig.class.count;
        const totalSelected = knownLanguages.selected.common.length + knownLanguages.selected.rare.length + knownLanguages.selected.ancestry.length + knownLanguages.selected.class.length;

        if (totalSelected < totalPoints) {
            errors.languages = true;
        }

        // Patron Validation
        if (classDetails?.system?.patron?.required && !formData.patron) {
            errors.patron = true;
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setCreationError(`Please check the following fields: ${Object.keys(errors).join(", ")}`);
            // Scroll to top or first error
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // Level 1 Intercept
        if (!formData.level0 && extraItems.length === 0) {
            setShowLevelUp(true);
            return;
        }

        setLoading(true);

        try {
            // 1. Prepare Items & System Data Strings
            const items: any[] = [];
            const effectivePatronUuid = extraData.patronUuid || formData.patron;
            const patronDoc = effectivePatronUuid ? await fetchDocument(effectivePatronUuid) : null;

            const enrichmentContext: EnrichmentContext = {
                addedSourceIds: new Set<string>(),
                addedNames: new Set<string>(),
                targetLevel: formData.level0 ? 0 : 1,
                actor: null,
                patronName: patronDoc?.name || undefined,
                discoveredItems: [],
                resolveDoc: fetchDocument
            };

            const addItem = async (uuid: string) => {
                const doc = await fetchDocument(uuid);
                if (!doc) return null;
                const enriched = await enrichItem(doc, enrichmentContext);
                if (enriched) items.push(enriched);
                return enriched;
            };

            // 2. Ancestry & Basic Traits (Level 0 Only - Level 1+ resolved via Server)
            if (formData.level0) {
                const ancestryDoc = await fetchDocument(formData.ancestry);
                if (ancestryDoc) {
                    const enriched = await enrichItem(ancestryDoc, enrichmentContext);
                    if (enriched) {
                        items.push(enriched);
                        const subItems = await resolveSubItems(ancestryDoc, fetchDocument, enrichmentContext);
                        items.push(...subItems);
                    }
                }

                for (const uuid of selectedAncestryTalents) {
                    await addItem(uuid);
                }

                // Gear (Level 0)
                if (gearSelected.length > 0) {
                    for (const item of gearSelected) {
                        const enriched = await enrichItem(item, enrichmentContext);
                        if (enriched) items.push(enriched);
                    }
                }

                await addItem(formData.background);

                if (effectivePatronUuid) {
                    await addItem(effectivePatronUuid);
                }
            }

            // Class resolution is handled by Server for Level 1+
            // Level 0 characters have no class.

            // Add Level Up Items (Talents, Boons, Spells)


            for (const item of extraItems) {
                // Determine Source ID
                const sourceId = item.flags?.core?.sourceId || item.uuid || item._id;

                // 1. FILTER: Gear for Level 1 Characters
                if (!formData.level0) {
                    const type = (String(item.type || "")).toLowerCase();
                    if (['weapon', 'armor', 'basic', 'potion', 'scroll'].includes(type) || item.type === 'gear') {
                        continue;
                    }
                }

                // 2. Enrich and Add
                const enriched = await enrichItem(item, enrichmentContext);
                if (enriched) {
                    items.push(enriched);
                }
            }

            // Add any items discovered via description @UUID links
            if (enrichmentContext.discoveredItems && enrichmentContext.discoveredItems.length > 0) {
                items.push(...enrichmentContext.discoveredItems);
            }


            if (!formData.level0) {
                // Class already added above? No, wait.
                // Originally lines 757 added Class if !formData.level0.
                // Wait, I see lines 885 `if (!formData.level0) await addItem(formData.class);`.
                // Why is it duplicated in original code? (Line 757 and 885).
                // Ah, line 757 was checking `!formData.level0` too.
                // Let's remove the redundant call at 885 since we handled it at 757 (and handled duplication).
                // Actually, line 885 in original was OUTSIDE the extraItems loop.
                // My replacement covers up to 884.
                // I need to ensure line 885 is handled or compatible.
                // The original code had `if (!formData.level0) { await addItem(formData.class); }` AFTER the loop.
                // But it ALSO had it BEFORE the loop at line 757.
                // This explains the TRIPLICATION! One from line 757, one from Backend (LevelUp), one from line 885.
                // My deduplication logic will fix it regardless, but removing the logical redundancy is good too.
            }

            // Collect Language UUIDs for system.languages array
            const languageUuids: string[] = extraData.languages || [];

            if (!extraData.languages) {
                // Fixed languages - handle both string UUIDs and objects with uuid property
                for (const l of knownLanguages.fixed) {
                    if (typeof l === 'string') {
                        languageUuids.push(l);
                    } else if (l && l.uuid) {
                        languageUuids.push(l.uuid);
                    }
                }

                // Add flattened selections (these are already UUID strings)
                languageUuids.push(
                    ...knownLanguages.selected.common,
                    ...knownLanguages.selected.rare,
                    ...knownLanguages.selected.ancestry,
                    ...knownLanguages.selected.class
                );

                // Add any additional fixed languages from config
                if (languageConfig.fixed?.length > 0) {
                    for (const uuid of languageConfig.fixed) {
                        if (typeof uuid === 'string' && !languageUuids.includes(uuid)) {
                            languageUuids.push(uuid);
                        }
                    }
                }
            }


            // 2. Prepare Actor Data
            const actorData = {
                name: formData.name,
                type: 'Player',
                img: 'icons/svg/mystery-man.svg',
                system: {
                    ancestry: formData.ancestry || "",      // Link to Compendium UUID
                    background: formData.background || "",  // Link to Compendium UUID
                    class: formData.class || "",      // Link to Compendium UUID (Correct for Shadowdark)
                    patron: effectivePatronUuid || "",    // Link to Compendium UUID (Correct for Shadowdark)
                    alignment: formData.alignment,
                    deity: formData.deity,
                    details: {
                        title: formData.title || ""
                    },
                    languages: languageUuids, // Populate with selected language UUIDs
                    level: {
                        value: formData.level0 ? 0 : 1,
                        xp: 0,
                        next: formData.level0 ? 0 : 10
                    },
                    abilities: {
                        str: { value: formData.stats.STR.value, base: formData.stats.STR.value, bonus: 0 },
                        dex: { value: formData.stats.DEX.value, base: formData.stats.DEX.value, bonus: 0 },
                        con: { value: formData.stats.CON.value, base: formData.stats.CON.value, bonus: 0 },
                        int: { value: formData.stats.INT.value, base: formData.stats.INT.value, bonus: 0 },
                        wis: { value: formData.stats.WIS.value, base: formData.stats.WIS.value, bonus: 0 },
                        cha: { value: formData.stats.CHA.value, base: formData.stats.CHA.value, bonus: 0 }
                    },
                    attributes: {
                        hp: { value: extraData.hpRoll ?? formData.hp, max: extraData.hpRoll ?? formData.hp }
                    },
                    coins: {
                        gp: (extraData.gold !== undefined) ? extraData.gold : formData.gold,
                        sp: 0,
                        cp: 0
                    },
                    notes: formData.description
                },
                items: items
            };

            // 3. Send to API

            const headers: any = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('sheet-delver-token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/actors', {
                method: 'POST',
                headers,
                body: JSON.stringify(actorData)
            });

            const result = await res.json();
            if (result.success) {
                // Redirect to sheet - Wait 500ms for backend stabilization
                setTimeout(() => {
                    window.location.href = `/actors/${result.id}`;
                }, 500);
            } else {
                setCreationError('Creation Failed: ' + result.error);
                setLoading(false);
            }
        } catch (e: any) {
            logger.error('Character creation error:', e);
            setCreationError('Error: ' + e.message);
            setLoading(false);
        }
    };

    // 3. Main Render
    if (!isCoreReady || isAppLoading) {
        // Use the standard application loading aesthetic requested by the user
        const bootstrapMessage = !isCoreReady ? "World Starting..." : 
                                 loadingSystem ? "Loading Manifest..." : 
                                 "Hydrating Rules...";
        
        const bootstrapSubmessage = !isCoreReady ? "Please wait while the world launches" :
                                    loadingSystem ? "Reading the ancient scrolls..." :
                                    "Consulting the oracles...";

        return (
            <LoadingModal
                message={bootstrapMessage}
                submessage={bootstrapSubmessage}
                visible={true}
                theme={{
                    spinner: "w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto",
                }}
            />
        );
    }

    return (
        <div className={`flex flex-col min-h-screen font-crimson font-inter font-sans bg-neutral-100 text-black pb-24`}>

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
                            <img src="/icons/dice-d20.svg" alt="Randomize" className="w-12 h-12 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
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
                        <div className={`bg-white p-6 border-2 shadow-sm ${formErrors.name ? 'border-red-600' : 'border-black'}`}>
                            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-1">
                                <h2 className={`text-black font-black font-serif text-xl ${formErrors.name ? 'text-red-600' : ''}`}>
                                    <span>Name {formErrors.name && <span className="text-xs uppercase font-sans font-bold float-right mt-1 ml-2">Required</span>}</span>
                                </h2>
                                {formData.ancestry && (
                                    <button
                                        onClick={rollName}
                                        className="group relative flex items-center justify-center"
                                        title="Randomize Name"
                                    >
                                        <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110 bg-indigo-600 group-hover:bg-indigo-500 rounded-lg shadow-md">
                                            <img src="/icons/dice-d6.svg" alt="Roll dice" className="w-8 h-8 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                                        </div>
                                    </button>
                                )}
                            </div>
                            <div>
                                <input
                                    type="text"
                                    className={`w-full bg-transparent border-b-2 focus:border-black outline-none py-1 font-serif text-lg font-bold placeholder:text-neutral-300 ${formErrors.name ? 'border-red-600' : 'border-neutral-300'}`}
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
                                <button
                                    onClick={rollStats}
                                    className="group relative flex items-center justify-center"
                                    title="Roll All Stats (3d6)"
                                >
                                    <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110 bg-indigo-600 group-hover:bg-indigo-500 rounded-lg shadow-md">
                                        <img src="/icons/dice-d6.svg" alt="Roll dice" className="w-8 h-8 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                                    </div>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(stat => {
                                    // @ts-ignore
                                    const st = formData.stats[stat];
                                    return (
                                        <div key={stat} className="flex items-center justify-between">
                                            <span className="font-bold text-neutral-500 text-sm tracking-widest">{stat}</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={st.value}
                                                    onChange={(e) => handleStatChange(stat, e.target.value)}
                                                    className={`w-12 text-center bg-transparent border-b border-neutral-300 focus:border-black outline-none font-serif text-2xl font-bold ${st.value >= 15 ? 'text-amber-600' : 'text-black'} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                                />
                                                <span className="text-xs font-bold bg-neutral-200 px-2 py-0.5 rounded-full text-neutral-600 min-w-[2rem] text-center">
                                                    {st.mod >= 0 ? '+' : ''}{st.mod}
                                                </span>
                                                <button
                                                    onClick={() => rollSingleStat(stat)}
                                                    className="group relative flex items-center justify-center ml-1"
                                                    title={`Re-roll ${stat}`}
                                                >
                                                    <div className="w-7 h-7 flex items-center justify-center transition-all group-hover:scale-110 bg-indigo-600 group-hover:bg-indigo-500 rounded shadow-sm">
                                                        <img src="/icons/dice-d6.svg" alt="Roll dice" className="w-6 h-6 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]" />
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* HP & Gold */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Hit Points */}
                            <div className="bg-white p-4 border-2 border-black shadow-sm h-full flex flex-col justify-between">
                                <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2 flex justify-between items-center">
                                    <span>HP</span>
                                </h2>
                                <div className="text-center flex-1 flex flex-col justify-center">
                                    {formData.level0 ? (
                                        <>
                                            <span className="text-3xl font-black font-serif">{formData.hp}</span>
                                            <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">1 + CON</p>
                                        </>
                                    ) : (
                                        <span className="text-sm font-bold text-neutral-400 italic">To be determined upon creation</span>
                                    )}
                                </div>
                            </div>

                            {/* Gold */}
                            <div className="bg-white p-4 border-2 border-black shadow-sm h-full flex flex-col justify-between">
                                <h2 className="text-black font-black font-serif text-lg border-b-2 border-black mb-2 flex justify-between items-center">
                                    <span>Gold</span>
                                </h2>
                                <div className="text-center flex-1 flex flex-col justify-center">
                                    {
                                        formData.level0 ? (
                                            <>
                                                <span className="text-xl font-black font-serif">See Details</span>
                                                <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">Starting Gear</p>
                                            </>
                                        ) : (
                                            <span className="text-sm font-bold text-neutral-400 italic">To be determined upon creation</span>
                                        )
                                    }

                                </div>
                            </div>
                        </div>


                    </div>

                    {/* Column 2: Identity & Choices */}
                    <div className="space-y-6">
                        {/* Class */}
                        <div className={`bg-white p-6 border-2 shadow-sm transition-opacity ${formData.level0 ? 'opacity-50 pointer-events-none grayscale border-black' : (formErrors.class ? 'border-red-600' : 'border-black')}`}>
                            <h2 className={`text-black font-black font-serif text-xl border-b-2 mb-4 pb-1 flex justify-between items-center ${formErrors.class ? 'border-red-600 text-red-600' : 'border-black'}`}>
                                <span>Class {formErrors.class && <span className="text-xs uppercase font-sans font-bold float-right mt-1">Required</span>}</span>
                            </h2>
                            <select
                                value={formData.class}
                                onChange={(e) => setFormData(prev => ({ ...prev, class: e.target.value }))}
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                                disabled={formData.level0}
                            >
                                <option value="">Select class...</option>
                                {(collections.classes || []).filter((c: any) => c.name !== "Level 0").sort((a: any, b: any) => a.name.localeCompare(b.name)).map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                            {formData.level0 && <p className="text-xs text-neutral-400 mt-2 text-center italic">Class is not available for Level 0 characters.</p>}
                        </div>

                        {/* Ancestry */}
                        <div className={`bg-white p-6 border-2 shadow-sm ${formErrors.ancestry ? 'border-red-600' : 'border-black'}`}>
                            <h2 className={`text-black font-black font-serif text-xl border-b-2 mb-4 pb-1 flex justify-between items-center ${formErrors.ancestry ? 'border-red-600 text-red-600' : 'border-black'}`}>
                                <span>Ancestry {formErrors.ancestry && <span className="text-xs uppercase font-sans font-bold float-right mt-1">Required</span>}</span>
                            </h2>
                            <select
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                                value={formData.ancestry}
                                onChange={(e) => {
                                    setFormData(prev => ({ ...prev, ancestry: e.target.value }));
                                    setSelectedAncestryTalents([]); // Reset talents on manual change
                                    // Reset languages related to ancestry
                                    setKnownLanguages(prev => ({
                                        ...prev,
                                        selected: { ...prev.selected, ancestry: [] }
                                    }));
                                }}
                            >
                                <option value="">Select Ancestry...</option>
                                {(collections.ancestries || []).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((a: any) => (
                                    <option key={a.uuid} value={a.uuid}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Background */}
                        <div className={`bg-white p-6 border-2 shadow-sm ${formErrors.background ? 'border-red-600' : 'border-black'}`}>
                            <h2 className={`text-black font-black font-serif text-xl border-b-2 mb-4 pb-1 flex justify-between items-center ${formErrors.background ? 'border-red-600 text-red-600' : 'border-black'}`}>
                                <span>Background {formErrors.background && <span className="text-xs uppercase font-sans font-bold float-right mt-1">Required</span>}</span>
                            </h2>
                            <select
                                value={formData.background}
                                onChange={(e) => setFormData(prev => ({ ...prev, background: e.target.value }))}
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-2 text-lg font-bold font-serif"
                            >
                                <option value="">Select background...</option>
                                {(collections.backgrounds || []).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((a: any) => (
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
                                value={formData.deity}
                                onChange={(e) => setFormData(prev => ({ ...prev, deity: e.target.value }))}
                                className="w-full bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-1 font-serif text-lg"
                            >
                                <option value="">Select deity...</option>
                                {(collections.deities || []).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((a: any) => (
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

                                {/* 2. Ancestry Talents (Unified List) */}
                                {(ancestryTalents.fixed.length > 0 || ancestryTalents.choiceCount > 0) && (
                                    <div className="mt-1 leading-tight">
                                        <span className={`font-bold ${formErrors.ancestryTalents ? 'text-red-600' : 'text-black'}`}>
                                            Ancestry Talents:
                                        </span>
                                        <span className="ml-1">
                                            {[
                                                ...ancestryTalents.fixed.map(t => t.name),
                                                ...(ancestryTalents.choice.length > 0
                                                    ? ancestryTalents.choice
                                                        .filter(t => selectedAncestryTalents.includes(t.uuid))
                                                        .map(t => t.name)
                                                    : [])
                                            ].join(", ") || (ancestryTalents.choiceCount > 0 ? "None selected" : "")}
                                        </span>

                                        {ancestryTalents.choiceCount > 0 && (
                                            <>
                                                <button
                                                    onClick={() => setShowAncestryTalentsModal(true)}
                                                    className={`ml-2 text-[10px] px-2 py-1 rounded border transition-colors uppercase font-bold tracking-widest ${selectedAncestryTalents.length === ancestryTalents.choiceCount
                                                        ? 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200 hover:border-black'
                                                        : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-300 hover:border-indigo-400'
                                                        }`}
                                                >
                                                    {selectedAncestryTalents.length === ancestryTalents.choiceCount ? 'Edit Choices' : `Select (${selectedAncestryTalents.length}/${ancestryTalents.choiceCount})`}
                                                </button>
                                                {formErrors.ancestryTalents && <span className="ml-2 text-xs uppercase font-bold text-red-600">Required</span>}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Ancestry Talent Modal */}
                                {showAncestryTalentsModal && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                                        <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" onClick={() => setShowAncestryTalentsModal(false)}></div>
                                        <div className="relative w-full max-w-lg bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                                            <div className="bg-black p-4 flex justify-between items-center">
                                                <h3 className="text-xl font-black text-white uppercase tracking-wider font-serif">
                                                    Choose {ancestryTalents.choiceCount} Talent{ancestryTalents.choiceCount > 1 ? 's' : ''}
                                                </h3>
                                                <button
                                                    onClick={() => setShowAncestryTalentsModal(false)}
                                                    className="text-neutral-400 hover:text-white transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="p-6 overflow-y-auto">
                                                <div className="space-y-3">
                                                    {ancestryTalents.choice.map((t: any) => {
                                                        const isSelected = selectedAncestryTalents.includes(t.uuid);
                                                        const canSelect = isSelected || selectedAncestryTalents.length < ancestryTalents.choiceCount;

                                                        return (
                                                            <div
                                                                key={t.uuid || t.name}
                                                                onClick={() => {
                                                                    if (isSelected) {
                                                                        setSelectedAncestryTalents(prev => prev.filter(id => id !== t.uuid));
                                                                    } else if (canSelect) {
                                                                        setSelectedAncestryTalents(prev => [...prev, t.uuid]);
                                                                    }
                                                                }}
                                                                className={`p-4 border-2 transition-all cursor-pointer ${isSelected
                                                                    ? 'border-black bg-indigo-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                                                                    : canSelect
                                                                        ? 'border-neutral-200 hover:border-black hover:bg-neutral-100'
                                                                        : 'border-neutral-100 opacity-50 cursor-not-allowed bg-neutral-50'
                                                                    }`}
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div className={`font-serif font-black text-sm uppercase tracking-widest ${isSelected ? 'text-black' : 'text-neutral-600'}`}>{t.name}</div>
                                                                    {isSelected && <span className="text-indigo-600 font-bold">✓</span>}
                                                                </div>
                                                                <div className="text-xs text-neutral-500 mt-2 font-medium" dangerouslySetInnerHTML={{ __html: t.description }}></div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="p-4 border-t-4 border-black bg-neutral-100 flex justify-between items-center">
                                                <span className="text-xs font-black uppercase tracking-widest text-neutral-500">
                                                    {selectedAncestryTalents.length} / {ancestryTalents.choiceCount} selected
                                                </span>
                                                <button
                                                    onClick={() => setShowAncestryTalentsModal(false)}
                                                    className="px-6 py-2 bg-black text-white font-black uppercase tracking-widest text-sm hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                                {/* 7. Class Talents (Fixed) */}
                                {!formData.level0 && classDetails && classTalents.fixed.length > 0 && (
                                    <div className="mt-1 leading-tight">
                                        <span className="font-bold text-black">Class Talents: </span>
                                        <span>
                                            {classTalents.fixed.map(t => t.name).join(", ")}
                                        </span>
                                        {classTalents.table && (
                                            <span className="italic text-neutral-500 ml-1">
                                                (+ Random Class Talent)
                                            </span>
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
                            <span className={`font-bold ${formErrors.languages ? 'text-red-600' : ''}`}>
                                Languages:
                                {formErrors.languages && <span className="ml-2 text-xs uppercase font-bold text-red-600">Required</span>}
                            </span>
                            <span>
                                {[
                                    ...knownLanguages.fixed.map((l: any) => l.name || resolveName(l, 'languages')).filter(Boolean),
                                    ...([
                                        ...knownLanguages.selected.common,
                                        ...knownLanguages.selected.rare,
                                        ...knownLanguages.selected.ancestry,
                                        ...knownLanguages.selected.class
                                    ].map(uuid => resolveName(uuid, 'languages')).filter(Boolean))
                                ].join(", ") || "Common"}
                            </span>

                            {(languageConfig.common > 0 || languageConfig.rare > 0 || languageConfig.ancestry.count > 0 || languageConfig.class.count > 0) && (() => {
                                const totalSelected = knownLanguages.selected.common.length + knownLanguages.selected.rare.length + knownLanguages.selected.ancestry.length + knownLanguages.selected.class.length;
                                const totalAllowed = languageConfig.common + languageConfig.rare + languageConfig.ancestry.count + languageConfig.class.count;

                                return (
                                    <button
                                        onClick={() => setShowLanguageModal(true)}
                                        className={`ml-2 text-[10px] px-2 py-1 rounded border transition-colors uppercase font-bold tracking-widest ${totalSelected >= totalAllowed
                                            ? 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200'
                                            : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-300'
                                            }`}
                                    >
                                        {totalSelected >= totalAllowed ? 'Edit Languages' : `Select (${totalSelected}/${totalAllowed})`}
                                    </button>
                                );
                            })()}
                        </div>

                        {/* Language Selection Modal */}
                        {showLanguageModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                                <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" onClick={() => setShowLanguageModal(false)}></div>
                                <div className="relative w-full max-w-3xl bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                                    <div className="bg-black p-4 flex justify-between items-center">
                                        <h3 className="text-xl font-black text-white uppercase tracking-wider font-serif">Select Languages</h3>
                                        <button onClick={() => setShowLanguageModal(false)} className="text-neutral-400 hover:text-white transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="p-6 overflow-y-auto space-y-6">
                                        {[
                                            { key: 'ancestry', label: 'Ancestry Languages', config: languageConfig.ancestry },
                                            { key: 'class', label: 'Class Languages', config: languageConfig.class },
                                            { key: 'common', label: 'Common Languages', config: { count: languageConfig.common, options: [] } },
                                            { key: 'rare', label: 'Rare Languages', config: { count: languageConfig.rare, options: [] } }
                                        ].map(section => {
                                            if (section.config.count <= 0) return null;

                                            const bucketKey = section.key as keyof typeof knownLanguages.selected;
                                            const selectedIds = knownLanguages.selected[bucketKey] || [];

                                            // Determine Options
                                            let options: any[] = [];
                                            if (section.key === 'common') {
                                                // @ts-ignore
                                                options = collections.languages?.filter((l: any) => !l.rarity || l.rarity === 'common') || [];
                                            } else if (section.key === 'rare') {
                                                // @ts-ignore
                                                options = collections.languages?.filter((l: any) => l.rarity === 'rare') || [];
                                            } else {
                                                // @ts-ignore
                                                const allowedIds = section.config.options;
                                                if (allowedIds && allowedIds.length > 0) {
                                                    // @ts-ignore
                                                    options = allowedIds.map(uuid => collections.languages?.find((l: any) => l.uuid === uuid)).filter(Boolean);
                                                } else {
                                                    // @ts-ignore
                                                    options = collections.languages || [];
                                                }
                                            }

                                            options.sort((a, b) => a.name.localeCompare(b.name));

                                            return (
                                                <div key={section.key}>
                                                    <h4 className="font-black font-serif text-sm uppercase tracking-widest text-black mb-3 border-b-2 border-black flex justify-between">
                                                        <span>{section.label}</span>
                                                        <span className="text-neutral-500 font-sans tracking-normal">{selectedIds.length} / {section.config.count}</span>
                                                    </h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {options.map((l: any) => {
                                                            const isFixed = knownLanguages.fixed.some(f => f.uuid === l.uuid) || languageConfig.fixed.includes(l.uuid);
                                                            if (isFixed) return null;

                                                            const isSelectedInBucket = selectedIds.includes(l.uuid);
                                                            const isSelectedElsewhere = Object.entries(knownLanguages.selected).some(([k, ids]) => k !== section.key && ids.includes(l.uuid));
                                                            const canSelect = isSelectedInBucket || (selectedIds.length < section.config.count && !isSelectedElsewhere);

                                                            let validStyle = 'border-neutral-200 hover:border-black hover:bg-neutral-100';
                                                            if (isSelectedInBucket) validStyle = 'border-black bg-indigo-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold';
                                                            if (isSelectedElsewhere) validStyle = 'opacity-30 cursor-not-allowed border-neutral-100 grayscale';
                                                            if (!canSelect && !isSelectedElsewhere && !isSelectedInBucket) validStyle = 'opacity-50 cursor-not-allowed border-neutral-100';

                                                            return (
                                                                <div
                                                                    key={l.uuid}
                                                                    onClick={() => {
                                                                        if (isSelectedElsewhere) return;
                                                                        if (isSelectedInBucket) {
                                                                            setKnownLanguages(prev => ({
                                                                                ...prev,
                                                                                selected: { ...prev.selected, [bucketKey]: prev.selected[bucketKey].filter(id => id !== l.uuid) }
                                                                            }));
                                                                        } else if (canSelect) {
                                                                            setKnownLanguages(prev => ({
                                                                                ...prev,
                                                                                selected: { ...prev.selected, [bucketKey]: [...prev.selected[bucketKey], l.uuid] }
                                                                            }));
                                                                        }
                                                                    }}
                                                                    className={`p-3 border-2 transition-all cursor-pointer text-xs uppercase font-bold tracking-wider ${validStyle}`}
                                                                >
                                                                    <div className="flex justify-between items-center">
                                                                        <span>{l.name}</span>
                                                                        {isSelectedInBucket && <span className="text-indigo-600 font-bold">✓</span>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="p-4 border-t-4 border-black bg-neutral-100 flex justify-end">
                                        <button
                                            onClick={() => setShowLanguageModal(false)}
                                            className="px-8 py-2 bg-black text-white font-black uppercase tracking-widest text-sm hover:bg-neutral-800 transition-colors shadow-[4px_4px_0px_0px_rgba(100,100,100,1)] active:translate-y-1 active:shadow-none"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. Patron */}
                        {classDetails?.system?.patron?.required && (
                            <div className="mt-1">
                                <span className="font-bold">Patron: </span>
                                {formData.patron && patronDetails ? (
                                    <span>
                                        <span className="font-bold italic">{patronDetails.name}</span>
                                        <button
                                            onClick={() => setShowPatronModal(true)}
                                            className="ml-2 text-[10px] px-2 py-1 rounded border bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300 uppercase font-bold tracking-widest transition-colors hover:border-black"
                                        >
                                            Edit/Change
                                        </button>
                                        <div className="italic text-neutral-600 text-[11px] mt-1 leading-tight ml-4 border-l-2 border-neutral-200 pl-2">
                                            <span dangerouslySetInnerHTML={{ __html: (patronDetails.system?.description?.value || patronDetails.system?.description || "").replace(/<[^>]+>/g, ' ') }}></span>
                                        </div>
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setShowPatronModal(true)}
                                        className="ml-2 text-[10px] px-2 py-1 rounded border bg-red-50 hover:bg-red-100 text-red-800 border-red-200 uppercase font-bold tracking-widest transition-colors hover:border-red-400"
                                    >
                                        Select Patron
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Patron Selection Modal */}
                        {showPatronModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
                                <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" onClick={() => setShowPatronModal(false)}></div>
                                <div className="relative w-full max-w-lg bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                                    <div className="bg-black p-4 flex justify-between items-center">
                                        <h3 className="text-xl font-black text-white uppercase tracking-wider font-serif">Choose Patron</h3>
                                        <button onClick={() => setShowPatronModal(false)} className="text-neutral-400 hover:text-white transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
                                        <div className="generator-patron-selection">
                                            {!(collections.patrons || []).length ? (
                                                <div className="text-center py-8 text-neutral-400 italic font-medium">
                                                    No patrons discovered...
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {(collections.patrons || []).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((p: any) => (
                                                        <div 
                                                            key={p.uuid}
                                                            className={`p-4 border-2 transition-all cursor-pointer flex flex-col items-center text-center gap-1 group ${
                                                                formData.patron === p.uuid 
                                                                    ? 'border-black bg-indigo-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' 
                                                                    : 'border-neutral-200 hover:border-black hover:bg-neutral-100'
                                                            }`}
                                                            onClick={() => setFormData(prev => ({ ...prev, patron: p.uuid }))}
                                                        >
                                                            <div className="flex justify-between items-center w-full">
                                                                <div className={`font-serif font-black text-sm uppercase tracking-widest ${formData.patron === p.uuid ? 'text-black' : 'text-neutral-600'}`}>
                                                                    {p.name}
                                                                </div>
                                                                {formData.patron === p.uuid && <span className="text-indigo-600 font-bold text-lg">✓</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 border-t-4 border-black bg-neutral-100 flex justify-end">
                                        <button
                                            onClick={() => setShowPatronModal(false)}
                                            className="px-8 py-2 bg-black text-white font-black uppercase tracking-widest text-sm hover:bg-neutral-800 transition-colors shadow-[4px_4px_0px_0px_rgba(100,100,100,1)] active:translate-y-1 active:shadow-none"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </div>
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
                    <p className="text-neutral-400 font-serif italic text-lg opacity-80">&quot;Protect the light!&quot;</p>
                    {creationError && (
                        <div className="w-full max-w-md bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded text-center text-sm font-bold animate-pulse">
                            {creationError}
                        </div>
                    )}
                    <button
                        onClick={() => createCharacter([])}
                        disabled={loading}
                        className="w-full max-w-md bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded shadow-lg uppercase tracking-widest text-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                    >
                        {loading ? 'Creating...' : 'Create Character'}
                    </button>
                    <p className="text-xs text-neutral-500">{(systemData?.titles?.main || 'Shadowdark')} {systemData?.titles?.version || ''}</p>
                </div>

                {/* Stat Selection Modal */}
                {currentStatPrompt && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm"></div>
                        <div className="relative w-full max-w-md bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="bg-black p-4">
                                <h3 className="text-xl font-black text-white uppercase tracking-wider font-serif">Increase Stat</h3>
                            </div>
                            <div className="p-6">
                                <p className="text-neutral-600 mb-6 font-medium">
                                    This talent grants <strong className="text-black">+{currentStatPrompt.amount}</strong> to one stat of your choice.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map(stat => (
                                        <button
                                            key={stat}
                                            onClick={() => handleStatSelect(stat)}
                                            className="p-4 border-2 border-neutral-200 hover:border-black hover:bg-neutral-100 transition-all flex flex-col items-center group"
                                        >
                                            <span className="font-black font-serif text-2xl uppercase tracking-widest group-hover:scale-110 transition-transform">{stat}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {/* Level Up Modal */}
                {showLevelUp && !formData.level0 && classDetails && (
                    <LevelUpModal
                        actorId=""
                        currentLevel={0}
                        targetLevel={1}
                        ancestry={ancestryDetails}
                        classObj={classDetails}
                        classUuid={formData.class}
                        patron={formData.patron ? { uuid: formData.patron, system: collections.patrons?.find((p: any) => p.uuid === formData.patron) } : null}
                        abilities={formData.stats}
                        availableClasses={collections.classes || []}
                        availableLanguages={collections.languages || []}
                        knownLanguages={[
                            ...knownLanguages.fixed.map((l: any) => typeof l === 'string' ? { uuid: l, name: resolveName(l, 'languages') } : l),
                            ...[...knownLanguages.selected.common, ...knownLanguages.selected.rare, ...knownLanguages.selected.ancestry, ...knownLanguages.selected.class].map(uuid => {
                                return { uuid, name: resolveName(uuid, 'languages') };
                            })
                        ]}
                        skipLanguageSelection={true}
                        foundryUrl={foundryUrl}
                        spells={[]}
                        onComplete={(data) => {
                            setShowLevelUp(false);
                            // Pass both items and the extra roll/language data
                            createCharacter(data.items, data);
                        }}
                        onCancel={() => {
                            setShowLevelUp(false);
                            setLoading(false);
                        }}
                    />
                )}

                {/* Randomization Overlay */}
                {isRandomizing && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm"></div>
                        <div className="relative bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] p-8 flex flex-col items-center gap-6 max-w-sm text-center animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 border-4 border-neutral-200 border-t-black rounded-full animate-spin"></div>
                            <div>
                                <h3 className="text-2xl font-black text-black uppercase tracking-wider font-serif">Divining Fate...</h3>
                                <p className="text-neutral-500 mt-2 font-medium italic">Consulting the oracles for your destiny.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

};
