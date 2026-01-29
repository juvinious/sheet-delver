'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    resolveImage,
    formatDescription,
    getSafeDescription
} from './sheet-utils';
import SpellSelectionModal from './components/SpellSelectionModal';
import { Pencil, Plus, Settings2 } from 'lucide-react';

interface SpellsTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    triggerRollDialog: (type: string, key: string, name?: string) => void;
    onRoll: (type: string, key: string, options?: any) => void;
    foundryUrl?: string;
    systemData?: any;
    onDeleteItem?: (itemId: string) => void;
}

export default function SpellsTab({ actor, onUpdate, triggerRollDialog, onRoll, foundryUrl, systemData, onDeleteItem }: SpellsTabProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingTier, setEditingTier] = useState<number | null>(null);

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

    // Calculate Max Selections
    const [maxSelections, setMaxSelections] = useState<number | undefined>(undefined);

    useEffect(() => {
        const calculateMax = async () => {
            if (!editingTier) {
                setMaxSelections(undefined);
                return;
            }

            let classData = actor.items?.find((i: any) => i.type === 'Class');

            // If class item not found in embedded items, try fetching by UUID from system.class
            if (!classData && actor.system?.class) {
                try {
                    const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(actor.system.class)}`);
                    if (res.ok) {
                        classData = await res.json();
                    }
                } catch (e) {
                    console.error("Failed to fetch class data", e);
                }
            }

            if (classData?.system?.spellcasting?.spellsknown) {
                const currentLevel = actor.system?.level?.value || 0;
                const table = classData.system.spellcasting.spellsknown;
                const levelData = table[String(currentLevel)] || table[currentLevel];

                console.log('DEBUG: Calculating Max Selections', {
                    currentLevel,
                    editingTier,
                    levelData,
                    table
                });

                if (levelData) {
                    const max = levelData[String(editingTier)] || levelData[editingTier];
                    // Ensure we have a number
                    const finalMax = typeof max === 'number' ? max : parseInt(max || '0');
                    console.log('DEBUG: Found Max', finalMax);
                    setMaxSelections(finalMax);
                    return;
                }
            } else {
                console.log('DEBUG: No spellsknown table found', classData);
            }
            // Default to undefined if no table found (limits disabled)
            setMaxSelections(undefined);
        };

        calculateMax();
    }, [actor, editingTier]);

    const handleManageSpells = async (selectedSpells: any[]) => {
        if (!editingTier) return;

        // Current spells in this Tier matching by name/source
        const currentSpells = actor.items?.filter((i: any) => i.type === 'Spell' && i.system?.tier === editingTier) || [];
        const currentNames = new Set(currentSpells.map((s: any) => s.name));
        const selectedNames = new Set(selectedSpells.map(s => s.name));

        // ADD: Selected but not currently known
        const toAdd = selectedSpells.filter(s => !currentNames.has(s.name));

        // REMOVE: Currently known but not selected
        const toRemove = currentSpells.filter((s: any) => !selectedNames.has(s.name));

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

        setIsAddModalOpen(false);
    };

    const handleAddSpell = async (spell: any) => {
        try {
            const res = await fetch(`/api/modules/shadowdark/actors/${actor._id || actor.id}/spells/learn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ spellUuid: spell.uuid })
            });
            // We rely on optimistic updates or re-fetches triggered higher up
        } catch (e) {
            console.error(e);
        }
    };

    const openManageModal = (tier: number) => {
        setEditingTier(tier);
        setIsAddModalOpen(true);
    };

    const spellOptions = useMemo(() => {
        if (!systemData?.spells || !editingTier) return [];

        const seen = new Set();
        return systemData.spells.filter((s: any) => {
            if (s.tier !== editingTier) return false;
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
        });
    }, [systemData?.spells, editingTier]);

    const knownSpellsForModal = actor.items?.filter((i: any) => i.type === 'Spell' && i.system?.tier === editingTier).map((s: any) => ({
        name: s.name,
        uuid: s.flags?.core?.sourceId || s._id,
        tier: editingTier,
        img: s.img
    })) || [];

    return (
        <div className="space-y-8 pb-20">
            {/* Spells Known */}
            <div className="space-y-6">
                {/* Header matching Talents Tab */}
                <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                    <span>Spells & Magic</span>
                    {actor.computed?.spellcastingAbility && (
                        <span className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300 font-sans tracking-normal normal-case">
                            Casting Attribute: <strong className="text-amber-500">{actor.computed.spellcastingAbility}</strong>
                        </span>
                    )}
                </div>

                {[1, 2, 3, 4, 5].map(tier => {
                    const spells = (actor.items?.filter((i: any) => i.type === 'Spell' && i.system?.tier === tier) || [])
                        .sort((a: any, b: any) => a.name.localeCompare(b.name));
                    if (spells.length === 0) return null;
                    return (
                        <div key={tier} className="">
                            <div className="border-b-2 border-black mb-2 flex items-end justify-between px-2 pb-1 group">
                                <span className="font-serif font-bold text-lg flex items-center gap-2">
                                    Tier {tier}
                                    <button
                                        onClick={() => openManageModal(tier)}
                                        className="text-xs bg-neutral-200 hover:bg-neutral-300 text-neutral-600 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                        title="Manage Spells"
                                    >
                                        <Settings2 className="w-3 h-3" />
                                        Manage
                                    </button>
                                </span>
                                <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-neutral-500 w-[300px] justify-between pr-2">
                                    <span className="w-32 text-center">Duration</span>
                                    <span className="w-20 text-center">Range</span>
                                    <span className="w-16 text-center"></span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {spells.map((spell: any) => {
                                    const isExpanded = expandedItems.has(spell.id);
                                    const lost = isLost(spell);

                                    return (
                                        <div key={spell.id} className="bg-white border-black border-2 p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group">
                                            {/* Header */}
                                            <div
                                                className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1 transition-colors"
                                                onClick={() => toggleItem(spell.id)}
                                            >
                                                {/* Spell Image / Fallback */}
                                                <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                                    {spell.img ? (
                                                        <img src={resolveImage(spell.img, foundryUrl)} alt={spell.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-white font-serif font-bold text-lg">{spell.name.charAt(0)}</span>
                                                    )}
                                                </div>

                                                {/* Name & Info */}
                                                <div className="flex-1 flex flex-col justify-center overflow-hidden">
                                                    <div className={`font-serif font-bold text-lg uppercase leading-none truncate ${lost ? 'line-through text-neutral-400' : 'text-black'}`}>
                                                        {spell.name}
                                                    </div>
                                                    <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                                                        {spell.system?.class && <span>{spell.system.class}</span>}
                                                    </div>
                                                </div>

                                                {/* Metadata Columns (Duration/Range) */}
                                                <div className="flex items-center gap-4 w-[300px] justify-between">
                                                    <span className="text-sm font-serif w-32 text-center truncate">
                                                        {(() => {
                                                            const val = spell.system?.duration?.value;
                                                            const type = spell.system?.duration?.type || '-';
                                                            const capType = type.charAt(0).toUpperCase() + type.slice(1);

                                                            if (val === undefined || val === null || val === '' || val === -1 || val === '-1') {
                                                                return capType;
                                                            }

                                                            if ((val === 1 || val === '1') && capType.endsWith('s')) {
                                                                return `${val} ${capType.slice(0, -1)}`;
                                                            }

                                                            return `${val} ${capType}`;
                                                        })()}
                                                    </span>
                                                    <span className="text-sm font-serif w-20 text-center truncate">{spell.system?.range || 'Close'}</span>

                                                    {/* Actions */}
                                                    <div className="flex gap-2 pl-2 items-center justify-end w-24">
                                                        {/* Cast Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (!lost) {
                                                                    triggerRollDialog('item', spell.id, spell.name);
                                                                }
                                                            }}
                                                            disabled={lost}
                                                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all shadow-sm touch-manipulation ${lost ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed opacity-50' : 'bg-black text-white hover:bg-neutral-800 hover:scale-110'}`}
                                                            title={lost ? "Spell Lost" : "Cast Spell"}
                                                        >
                                                            {/* Magical Sparkles Icon */}
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                                <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.803 2.61a3 3 0 001.92 1.92l2.61.803a.75.75 0 010 1.425l-2.61.803a3 3 0 00-1.92 1.92l-.803 2.61a.75.75 0 01-1.425 0l-.803-2.61a3 3 0 00-1.92-1.92l-2.61-.803a.75.75 0 010-1.425l2.61-.803a3 3 0 001.92-1.92l.803-2.61A.75.75 0 019 4.5zM6.375 18a.75.75 0 01.721.544l.279.91a1.5 1.5 0 00.957.957l.91.279a.75.75 0 010 1.425l-.91.279a1.5 1.5 0 00-.957.957l-.279.91a.75.75 0 01-1.425 0l-.279-.91a1.5 1.5 0 00-.957-.957l-.91-.279a.75.75 0 010-1.425l.91-.279a1.5 1.5 0 00.957-.957l.279-.91A.75.75 0 016.375 18zm13.5-4.5a.75.75 0 01.721.544l.279.91a1.5 1.5 0 00.957.957l.91.279a.75.75 0 010 1.425l-.91.279a1.5 1.5 0 00-.957.957l-.279.91a.75.75 0 01-1.425 0l-.279-.91a1.5 1.5 0 00-.957-.957l-.91-.279a.75.75 0 010-1.425l.91-.279a1.5 1.5 0 00.957-.957l.279-.91a.75.75 0 01.721-.544z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>

                                                        {/* Lost Toggle */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleLostToggle(spell.id, !!lost);
                                                            }}
                                                            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all hover:scale-110 shadow-sm touch-manipulation ${lost ? 'bg-red-100 border-red-500 text-red-600' : 'bg-white border-neutral-300 text-neutral-300 hover:border-black hover:text-black'}`}
                                                            title={lost ? "Restore Spell" : "Mark as Lost"}
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

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                                    <div className="mt-2 text-sm font-serif leading-relaxed text-neutral-800">
                                                        <div
                                                            dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(spell.system)) || '<span class="italic text-neutral-400">No description available.</span>' }}
                                                            onClick={handleDescriptionClick}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex gap-2 flex-wrap">
                                                        <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">Tier {spell.system?.tier}</span>
                                                        {spell.system?.duration?.type && (
                                                            <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">
                                                                Duration: {(() => {
                                                                    const val = spell.system?.duration?.value;
                                                                    const type = spell.system?.duration?.type || '-';
                                                                    const capType = type.charAt(0).toUpperCase() + type.slice(1);

                                                                    if (val === undefined || val === null || val === '' || val === -1 || val === '-1') {
                                                                        return capType;
                                                                    }
                                                                    if ((val === 1 || val === '1') && capType.endsWith('s')) {
                                                                        return `${val} ${capType.slice(0, -1)}`;
                                                                    }
                                                                    return `${val} ${capType}`;
                                                                })()}
                                                            </span>
                                                        )}
                                                        <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">Range: {spell.system?.range}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
                {(actor.items?.filter((i: any) => i.type === 'Spell').length === 0) && (
                    <div className="text-center text-neutral-400 italic py-12 border-2 border-dashed border-neutral-200 rounded-lg">No spells known.</div>
                )}
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
                                <div key={item.id} className="bg-white border-black border-2 p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group">
                                    {/* Header */}
                                    <div
                                        className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1 transition-colors"
                                        onClick={() => toggleItem(item.id)}
                                    >
                                        <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                            <img src={resolveImage(item.img, foundryUrl)} alt={item.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-serif font-bold text-lg leading-none">{item.name}</div>
                                            <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mt-1">{item.type}</div>
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                triggerRollDialog('item', item.id);
                                            }}
                                            className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center transition-all hover:scale-110 shadow-sm touch-manipulation"
                                            title="Use Item"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M12.9 2.2c-.4-.5-1.4-.5-1.8 0L2.8 12.8c-.4.5-.2 1.2.5 1.2h17.4c.7 0 .9-.7.5-1.2L12.9 2.2zM3.4 15c-.6 0-.9.7-.5 1.2l7.3 8c.4.4 1 .4 1.4 0l7.3-8c.4-.5.1-1.2-.5-1.2H3.4z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                            <div className="mt-2 text-sm font-serif leading-relaxed text-neutral-800">
                                                <div
                                                    className="prose prose-sm max-w-none"
                                                    dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(item.system)) || '<span class="italic text-neutral-400">No description available.</span>' }}
                                                    onClick={handleDescriptionClick}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
                {(actor.items?.filter((i: any) => ['Scroll', 'Wand'].includes(i.type)).length === 0) && (
                    <div className="text-center text-neutral-400 italic py-8 border-2 border-dashed border-neutral-200 rounded-lg">No magical items (Scrolls/Wands) found.</div>
                )}
            </div>
            {/* Modal */}
            {isAddModalOpen && (
                <SpellSelectionModal
                    isOpen={isAddModalOpen}
                    title={`Manage Spells - Tier ${editingTier}`}
                    availableSpells={spellOptions}
                    knownSpells={knownSpellsForModal}
                    onSave={handleManageSpells}
                    onClose={() => setIsAddModalOpen(false)}
                    foundryUrl={foundryUrl}
                    maxSelections={maxSelections}
                />
            )}
        </div>
    );
}
