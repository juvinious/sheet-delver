'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    resolveImage,
    formatDescription,
    getSafeDescription
} from './sheet-utils';
import SpellSelectionModal from './components/SpellSelectionModal';

import { Loader2 } from 'lucide-react';

interface SpellsTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    triggerRollDialog: (type: string, key: string, name?: string) => void;
    onRoll: (type: string, key: string, options?: any) => void;
    foundryUrl?: string;
    systemData?: any;
    onDeleteItem?: (itemId: string) => void;
    addNotification?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function SpellsTab({ actor, onUpdate, triggerRollDialog, onRoll, foundryUrl, systemData, onDeleteItem, addNotification }: SpellsTabProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingTier, setEditingTier] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const toggleItem = (id: string) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedItems(newSet);
    };

    const handleDescriptionClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const rollBtn = target.closest('button[data-action]');

        if (rollBtn) {
            e.preventDefault();
            e.stopPropagation();
            const action = rollBtn.getAttribute('data-action');
            if (action === 'roll-check') {
                const stat = rollBtn.getAttribute('data-stat');
                if (stat) onRoll('ability', stat);
            }
        }
    };

    const [optimisticLostState, setOptimisticLostState] = useState<Record<string, boolean>>({});

    const handleLostToggle = (spellId: string, currentLost: boolean) => {
        // Optimistic update
        setOptimisticLostState(prev => ({
            ...prev,
            [spellId]: !currentLost
        }));

        // Actual update
        onUpdate(`items.${spellId}.system.lost`, !currentLost);
    };

    // Effect to sync optimistic state with prop updates (clearing overrides when server syncs)
    // We can use a simple timeout or just let props take over if we want strict sync,
    // but for simple toggles, we usually just prefer the prop value *unless* we just clicked.
    // However, a simpler pattern for this sheet has been just one-way fire-and-forget with loading override,
    // or just relying on the fact that the prop will update eventually.
    // For true "snappy" feeling:
    const isLost = (spell: any) => {
        if (optimisticLostState[spell.id] !== undefined) {
            return optimisticLostState[spell.id];
        }
        return spell.system?.lost;
    };



    const handleManageSpells = async (selectedSpells: any[]) => {
        if (!editingTier || !modalFilterClass) return;

        setIsSaving(true);
        try {
            // Current spells in this Tier matching this class source
            const currentSpells = (actor.items || []).filter((i: any) => {
                if (i.type !== 'Spell') return false;
                const iTier = Number(i.system?.tier !== undefined ? i.system.tier : i.tier);
                if (iTier !== editingTier) return false;

                const classData = i.system?.class || i.class || '';
                const spellClasses = (Array.isArray(classData) ? classData.join(',') : String(classData)).toLowerCase();
                return spellClasses.includes(modalFilterClass);
            }) || [];

            const currentNames = new Set(currentSpells.map((s: { name: string }) => s.name));
            const selectedNames = new Set(selectedSpells.map((s: { name: string }) => s.name));

            // ADD: Selected but not currently known
            const toAdd = selectedSpells.filter((s: { name: string }) => !currentNames.has(s.name));

            // REMOVE: Currently known but not selected
            const toRemove = currentSpells.filter((s: { name: string; id: string; _id: string; }) => !selectedNames.has(s.name));

            console.log('DEBUG: Managing spells', {
                source: modalFilterClass,
                tier: editingTier,
                toAdd: toAdd.map((s: any) => s.name),
                toRemove: toRemove.map((s: any) => s.name)
            });

            // Execute ADDs
            for (const spell of toAdd) {
                await handleAddSpell(spell);
            }

            // Execute REMOVEs
            if (onDeleteItem && toRemove.length > 0) {
                for (const spell of toRemove) {
                    onDeleteItem(spell.id || spell._id);
                }
            }

            addNotification?.(`Successfully updated ${modalFilterClass} spells.`, 'success');
            setIsAddModalOpen(false);
        } catch (e) {
            console.error("Failed to manage spells", e);
            addNotification?.("Failed to update spells. Check console.", "error");
        } finally {
            setIsSaving(false);
        }
    };


    const handleAddSpell = async (spell: any) => {
        try {
            await fetch(`/api/modules/shadowdark/actors/${actor._id || actor.id}/spells/learn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spellUuid: spell.uuid })
            });
        } catch (e) {
            console.error(e);
        }
    };

    const spellSources = useMemo(() => {
        const sources: Map<string, any> = new Map();

        // 1. Primary Class
        const classItem = actor.items?.find((i: any) => i.type === 'Class');
        if (classItem?.system?.spellcasting?.ability) {
            const classKey = classItem.name.toLowerCase();
            sources.set(classKey, {
                name: classItem.name,
                type: 'class',
                classKey: classKey,
                spellcasting: classItem.system.spellcasting,
                bonusSpells: 0
            });
        }

        // 2. Talents/Boons that grant spellcasting (Formal field OR Name heuristic)
        const talents = actor.items?.filter((i: any) => i.type === 'Talent' || i.type?.toLowerCase() === 'boon');

        talents?.forEach((talent: any) => {
            const name = (talent.name || '').toLowerCase();
            const formalClasses = talent.system?.bonuses?.spellcastingClasses;

            let classKeys: string[] = [];

            // 1. Direct Bonus Field
            if (formalClasses) {
                classKeys = formalClasses.split(',').map((s: string) => s.trim().toLowerCase());
            }

            // 2. Active Effects attached to the talent
            if (talent.effects && Array.isArray(talent.effects)) {
                talent.effects.forEach((eff: any) => {
                    eff.changes?.forEach((change: any) => {
                        if (change.key === 'system.bonuses.spellcastingClasses' && change.value) {
                            const bonusClasses = String(change.value).split(',').map((s: string) => s.trim().toLowerCase());
                            bonusClasses.forEach(c => {
                                if (!classKeys.includes(c)) classKeys.push(c);
                            });
                        }
                    });
                });
            }

            // 3. Name Heuristic (Safeguard)
            if (classKeys.length === 0 && name.includes('learn a') && name.includes('spell')) {
                const knownClasses = ['wizard', 'priest', 'witch', 'warlock', 'ranger', 'bard', 'druid'];
                for (const cls of knownClasses) {
                    if (name.includes(cls)) {
                        classKeys.push(cls);
                        break;
                    }
                }
            }

            classKeys.forEach((key: string) => {
                const existing = sources.get(key);
                if (existing) {
                    existing.bonusSpells = (existing.bonusSpells || 0) + 1;
                } else {
                    sources.set(key, {
                        name: key.charAt(0).toUpperCase() + key.slice(1),
                        type: 'talent',
                        classKey: key,
                        talent: talent,
                        bonusSpells: 1
                    });
                }
            });
        });

        return Array.from(sources.values());
    }, [actor.items]);

    const getAccessibleTiers = (source: any) => {
        const level = actor.system?.level?.value || 0;
        const tiers = [];

        if (source.type === 'class' && source.spellcasting?.spellsknown) {
            const table = source.spellcasting.spellsknown;
            const levelData = table[String(level)] || table[level];
            if (levelData) {
                for (let t = 1; t <= 5; t++) {
                    const known = levelData[String(t)] || levelData[t];
                    if (known !== undefined && known !== null && known !== 0) {
                        tiers.push(t);
                    }
                }
            }
        } else if (source.type === 'talent') {
            const maxTier = Math.max(1, Math.floor(level / 2));
            for (let t = 1; t <= Math.min(maxTier, 5); t++) {
                tiers.push(t);
            }
        }

        return tiers;
    };

    const [modalFilterClass, setModalFilterClass] = useState<string | null>(null);

    const openManageModalWithSource = (tier: number, classKey: string) => {
        setEditingTier(tier);
        setModalFilterClass(classKey);
        setIsAddModalOpen(true);
    };

    const filteredSpellOptions = useMemo(() => {
        if (!systemData?.spells || !editingTier || !modalFilterClass) return [];

        const seen = new Set();
        const results = systemData.spells.filter((s: any) => {
            // Robust tier comparison
            const spellTier = Number(s.tier !== undefined ? s.tier : s.system?.tier);
            const tierMatch = spellTier === editingTier;

            // Robust class comparison
            const classData = s.class || s.system?.class || [];
            const spellClasses = (Array.isArray(classData) ? classData.join('|') : String(classData)).toLowerCase();
            const filterKey = (modalFilterClass || '').toLowerCase().trim();

            // Check for source key (e.g. 'wizard') OR the source name if we could find it
            const classMatch = spellClasses.includes(filterKey);

            // SURGICAL DEBUG FOR 'FOG'
            if (s.name === 'Fog' || s.name?.toLowerCase().includes('fog')) {
                console.log('DEBUG: Fog Filter Trace', {
                    name: s.name,
                    spellTier,
                    editingTier,
                    tierMatch,
                    spellClassesRaw: classData,
                    spellClassesProcesssed: spellClasses,
                    filterKey,
                    classMatch
                });
            }

            if (!tierMatch || !classMatch) return false;

            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
        });

        console.log('DEBUG: Filtering Summary', {
            tier: editingTier,
            source: modalFilterClass,
            totalAvailable: systemData.spells.length,
            matches: results.length,
            systemDebugKeys: systemData.debug ? 'Present' : 'Missing',
            sampleSpells: results.slice(0, 2).map((s: any) => s.name)
        });

        return results;
    }, [systemData, editingTier, modalFilterClass]);

    const getMaxSpellsForSource = useCallback((tier: number, classKey: string) => {
        const source = spellSources.find((s: any) => s.classKey === classKey);
        if (!source) return 0;

        let baseMax = 0;
        if (source.type === 'class') {
            const level = actor.system?.level?.value || 1;
            const table = source.spellcasting?.spellsknown;
            if (table) {
                const levelData = table[String(level)] || table[level];
                if (levelData) {
                    const val = levelData[String(tier)] || levelData[tier];
                    baseMax = typeof val === 'number' ? val : (val ? parseInt(val) : 0);
                }
            }
        }
        return baseMax + (source.bonusSpells || 0);
    }, [actor.system?.level?.value, spellSources]);

    const maxSelections = useMemo(() => {
        if (!editingTier || !modalFilterClass) return undefined;
        return getMaxSpellsForSource(editingTier, modalFilterClass);
    }, [editingTier, modalFilterClass, getMaxSpellsForSource]);

    const knownSpellsForModal = useMemo(() => {
        if (!editingTier || !modalFilterClass) return [];

        return (actor.items || []).filter((i: any) => {
            if (i.type !== 'Spell') return false;
            const iTier = Number(i.system?.tier !== undefined ? i.system.tier : i.tier);
            if (iTier !== editingTier) return false;

            const classData = i.system?.class || i.class || '';
            const spellClasses = (Array.isArray(classData) ? classData.join(',') : String(classData)).toLowerCase();
            return spellClasses.includes(modalFilterClass);
        }).map((s: any) => ({
            name: s.name,
            uuid: s.flags?.core?.sourceId || s.uuid || s._id,
            tier: editingTier,
            img: s.img,
            system: s.system
        }));
    }, [actor.items, editingTier, modalFilterClass]);

    return (
        <div className="space-y-8 pb-20">
            {/* Spells Known */}
            <div className="space-y-6">
                <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                    <span>SPELLS KNOWN</span>
                    {actor.computed?.spellcastingAbility && (
                        <span className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300 font-sans tracking-normal normal-case">
                            Casting Attribute: <strong className="text-amber-500">{actor.computed.spellcastingAbility}</strong>
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="border-b-2 border-black mb-2 flex items-end justify-between px-2 pb-1 text-xs font-bold uppercase tracking-widest text-neutral-500">
                        <span className="flex-1 font-serif text-lg text-black lowercase first-letter:uppercase">Name</span>
                        <div className="flex items-center gap-4 w-[500px] justify-between pr-2">
                            <span className="w-12 text-center">Tier</span>
                            <span className="w-40 text-center">Duration</span>
                            <span className="w-32 text-center">Range</span>
                            <span className="w-24 text-center">Actions</span>
                        </div>
                    </div>

                    {(() => {
                        const allSpells = (actor.items?.filter((i: any) => i.type === 'Spell') || [])
                            .sort((a: any, b: any) => {
                                const tierA = a.system?.tier || 0;
                                const tierB = b.system?.tier || 0;
                                if (tierA !== tierB) return tierA - tierB;
                                return a.name.localeCompare(b.name);
                            });

                        if (allSpells.length === 0) {
                            return (
                                <div className="text-center text-neutral-400 italic py-12 border-2 border-dashed border-neutral-200 rounded-lg">
                                    No spells known. Use the manage buttons to learn spells.
                                </div>
                            );
                        }

                        return allSpells.map((spell: any) => {
                            const isExpanded = expandedItems.has(spell.id);
                            const lost = isLost(spell);

                            return (
                                <div key={spell.id} className="bg-white border-black border-2 p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group">
                                    <div className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1" onClick={() => toggleItem(spell.id)}>
                                        <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                            {spell.img ? (
                                                <img src={resolveImage(spell.img, foundryUrl)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-white font-serif font-bold text-lg">{spell.name.charAt(0)}</span>
                                            )}
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center overflow-hidden">
                                            <div className={`font-serif font-bold text-lg uppercase leading-none truncate ${lost ? 'line-through text-neutral-400' : 'text-black'}`}>
                                                {spell.name}
                                            </div>
                                            {spell.system?.class && (
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                                                    {Array.isArray(spell.system.class) ? spell.system.class.join(', ') : spell.system.class}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4 w-[500px] justify-between">
                                            <span className="text-sm font-serif font-bold w-12 text-center">{spell.system?.tier}</span>
                                            <span className="text-sm font-serif w-40 text-center">
                                                {(() => {
                                                    const val = spell.system?.duration?.value;
                                                    const type = spell.system?.duration?.type || '-';
                                                    if (val === undefined || val === null || val === '' || val === -1) return type.charAt(0).toUpperCase() + type.slice(1);
                                                    return `${val} ${type.charAt(0).toUpperCase() + type.slice(1)}${val !== 1 ? 's' : ''}`;
                                                })()}
                                            </span>
                                            <span className="text-sm font-serif w-32 text-center">{spell.system?.range || 'Close'}</span>

                                            <div className="flex gap-2 items-center justify-end w-24">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!lost) triggerRollDialog('item', spell.id, spell.name);
                                                    }}
                                                    disabled={lost}
                                                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${lost ? 'bg-neutral-300 text-neutral-500 opacity-50' : 'bg-black text-white hover:scale-110'}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                        <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.803 2.61a3 3 0 001.92 1.92l2.61.803a.75.75 0 010 1.425l-2.61.803a3 3 0 00-1.92 1.92l-.803 2.61a.75.75 0 01-1.425 0l-.803-2.61a3 3 0 00-1.92-1.92l-2.61-.803a.75.75 0 010-1.425l2.61-.803a3 3 0 001.92-1.92l.803-2.61A.75.75 0 019 4.5z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleLostToggle(spell.id, !!lost);
                                                    }}
                                                    className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-all ${lost ? 'bg-red-100 border-red-500 text-red-600' : 'bg-white border-neutral-300 text-neutral-300 hover:border-black hover:text-black hover:scale-110'}`}
                                                >
                                                    {lost ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                        </svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                            <div
                                                className="mt-2 text-sm font-serif leading-relaxed text-neutral-800 prose prose-sm max-w-none"
                                                dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(spell.system)) }}
                                                onClick={handleDescriptionClick}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>

                {/* Manage Spells Section */}
                <div className="space-y-6 pt-10">
                    <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                        <span>MANAGE SPELLS</span>
                        {!systemData && (
                            <span className="text-xs font-normal opacity-70 animate-pulse">Loading spell database...</span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {spellSources.map((source: any) => {
                            const accessibleTiers = getAccessibleTiers(source);
                            if (accessibleTiers.length === 0) return null;

                            return (
                                <div key={source.classKey} className="border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white overflow-hidden flex flex-col">
                                    <div className="bg-black text-white p-2 font-serif font-bold text-sm uppercase tracking-widest border-b-2 border-black">
                                        {source.name}
                                    </div>
                                    <div className="p-4 bg-neutral-50 flex-1">
                                        <div className="flex wrap gap-2">
                                            {accessibleTiers.map(tier => {
                                                const max = getMaxSpellsForSource(tier, source.classKey);
                                                const current = (actor.items || []).filter((i: any) => {
                                                    if (i.type !== 'Spell') return false;
                                                    if (Number(i.system?.tier) !== tier) return false;
                                                    const classData = i.system?.class || "";
                                                    const spellClass = (Array.isArray(classData) ? classData.join(',') : String(classData)).toLowerCase();
                                                    return spellClass.includes(source.classKey) || (spellClass === "" && source.type === 'class');
                                                }).length;

                                                return (
                                                    <button
                                                        key={tier}
                                                        onClick={() => openManageModalWithSource(tier, source.classKey)}
                                                        className="px-4 py-2 bg-white border-2 border-black font-serif font-bold text-sm hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] flex flex-col items-center min-w-[100px]"
                                                    >
                                                        <span>TIER {tier}</span>
                                                        <span className="text-[10px] opacity-60 font-sans tracking-tighter capitalize">
                                                            {current} / {max}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Spells From Items */}
            <div className="space-y-4 pt-4">
                <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                    <span>Spells From Items</span>
                    <span className="text-xs font-normal opacity-70 tracking-normal">(Scrolls & Wands)</span>
                </div>
                <div className="space-y-2">
                    {actor.items?.filter((i: any) => ['Scroll', 'Wand'].includes(i.type))
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                        .map((item: any) => {
                            const isExpanded = expandedItems.has(item.id);
                            return (
                                <div key={item.id} className="bg-white border-black border-2 p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <div className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1" onClick={() => toggleItem(item.id)}>
                                        <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                            <img src={resolveImage(item.img, foundryUrl)} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-serif font-bold text-lg leading-none">{item.name}</div>
                                            <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mt-1">{item.type}</div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                triggerRollDialog('item', item.id);
                                            }}
                                            className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition-all shadow-sm"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M12.9 2.2c-.4-.5-1.4-.5-1.8 0L2.8 12.8c-.4.5-.2 1.2.5 1.2h17.4c.7 0 .9-.7.5-1.2L12.9 2.2zM3.4 15c-.6 0-.9.7-.5 1.2l7.3 8c.4.4 1 .4 1.4 0l7.3-8c.4-.5.1-1.2-.5-1.2H3.4z" />
                                            </svg>
                                        </button>
                                    </div>
                                    {isExpanded && (
                                        <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                            <div
                                                className="text-sm font-serif leading-relaxed text-neutral-800 prose prose-sm max-w-none"
                                                dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(item.system)) }}
                                                onClick={handleDescriptionClick}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
                {actor.items?.filter((i: any) => ['Scroll', 'Wand'].includes(i.type)).length === 0 && (
                    <div className="text-center text-neutral-400 italic py-8 border-2 border-dashed border-neutral-200 rounded-lg">No magical items (Scrolls/Wands) found.</div>
                )}
            </div>

            {/* Modal */}
            {isAddModalOpen && (
                <SpellSelectionModal
                    isOpen={isAddModalOpen}
                    title={`Manage ${modalFilterClass ? modalFilterClass.charAt(0).toUpperCase() + modalFilterClass.slice(1) : ''} Spells - Tier ${editingTier}`}
                    availableSpells={filteredSpellOptions}
                    knownSpells={knownSpellsForModal}
                    onSave={handleManageSpells}
                    onClose={() => setIsAddModalOpen(false)}
                    foundryUrl={foundryUrl}
                    maxSelections={maxSelections}
                />
            )}

            {isSaving && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className="bg-white p-6 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-black" />
                        <span className="font-serif font-bold uppercase tracking-widest text-lg text-black">Updating Spells...</span>
                    </div>
                </div>
            )}
        </div>
    );
}
