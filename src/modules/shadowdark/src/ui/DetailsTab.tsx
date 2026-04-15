'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useConfig } from '@client/ui/context/ConfigContext';
import CustomBoonModal from './components/CustomBoonModal';
import CompendiumSelectModal from './components/CompendiumSelectModal';
import LanguageSelectionModal from './components/LanguageSelectionModal';
import { ConfirmationModal } from '@client/ui/components/ConfirmationModal';
import { shadowdarkTheme } from './themes/shadowdark';
import { isRareLanguage } from '../logic/rules';
import { useShadowdarkUI } from './context/ShadowdarkUIContext';
import { useShadowdarkActor } from './context/ShadowdarkActorContext';
import dynamic from 'next/dynamic';
import LoadingModal from '@client/ui/components/LoadingModal';
import { LevelUpModal } from './components/LevelUpModal';

interface DetailsTabProps {
    foundryUrl?: string;
}

export default function DetailsTab({}: DetailsTabProps) {
    const { systemData, collections, fetchPack, resolveName } = useShadowdarkUI();
    const { resolveImageUrl } = useConfig();
    const {
        actor,
        updateActor,
        deleteItem,
        createItem,
        updateItem,
        getDraftValue,
        refreshActor,
        // Level-up state — single shared instance from context
        triggerLevelUp,
        showLevelUpModal,
        levelUpData,
        closeLevelUp
    } = useShadowdarkActor();
    const [selectionModal, setSelectionModal] = useState<any>({ isOpen: false });
    const [isCreatingBoon, setIsCreatingBoon] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
    const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
    const [fetchingCategory, setFetchingCategory] = useState<string | null>(null);

    const getClassName = () => {
        if (!actor.details?.class) {
            return '';
        }
        if (actor.details?.class === 'Level 0') {
            return 'Adventurer';
        }
        return actor.details?.class;
    };

    const openSelection = async (field: string, title: string, dataKey?: string, multiSelect = false) => {
        // Current Value (Calculate early for the loading state)
        let current: any = '';
        if (field.includes('.')) {
            const parts = field.split('.');
            current = actor;
            for (const p of parts) {
                if (current) current = (current as any)[p];
            }
        } else {
            current = actor[field];
        }

        // 1. Initial State: Open modal (Loading if data missing)
        // Check both small indexing in systemData and hydrated cache in collections
        const hasData = dataKey ? (!!systemData?.[dataKey] || !!collections?.[dataKey]) : true;
        const activeCollection = dataKey ? (collections?.[dataKey] || systemData?.[dataKey] || []) : [];
        
        setSelectionModal({
            isOpen: true,
            title,
            options: hasData && dataKey ? activeCollection.map((o: any) => ({
                name: o.name,
                uuid: o.uuid,
                description: o.description || o.system?.description?.value || o.data?.description?.value || ''
            })) : [],
            currentValue: hasData && dataKey ? resolveName(current, dataKey) : current,
            multiSelect,
            isLoading: !hasData,
            onSelect: (option: any) => handleSelection(field, option, multiSelect)
        });

        // 2. Hydration: If data is missing or incomplete, fetch it and update modal
        if (!hasData && dataKey) {
            setFetchingCategory(dataKey);
            try {
                const fetched = await fetchPack(dataKey);
                if (Array.isArray(fetched)) {
                    setSelectionModal((prev: any) => ({
                        ...prev,
                        isLoading: false,
                         options: fetched.map((o: any) => ({
                             name: o.name,
                             uuid: o.uuid,
                             description: o.description || o.system?.description?.value || o.data?.description?.value || ''
                         })),
                         currentValue: resolveName(current, dataKey)
                     }));
                }
            } finally {
                setFetchingCategory(null);
            }
        }
    };

    const handleSelection = (field: string, option: any, multiSelect: boolean) => {
        const valToStore = option.uuid || option.name;

        // Handle Multi-Select (Toggle)
        if (multiSelect) {
            setSelectionModal((prev: any) => {
                const currentVal = prev.currentValue;
                const modalOptions = prev.options;

                // Sanitize & Normalize to UUIDs
                const cleanArray = (Array.isArray(currentVal) ? currentVal : []).filter((c: any) => c != null).map((c: any) => {
                    const val = typeof c === 'object' ? (c.uuid || c.name) : c;
                    if (!val) return '';

                    const match = modalOptions.find((o: any) => o.uuid === val || o.name === val);
                    if (match && match.uuid) return match.uuid;

                    return val;
                }).filter((c: any) => c !== '');

                const newArray = Array.from(new Set(cleanArray));
                const targetVal = option.uuid || option.name;
                const existingIndex = newArray.findIndex((c: any) => c === targetVal);

                if (existingIndex >= 0) {
                    newArray.splice(existingIndex, 1);
                } else {
                    newArray.push(targetVal);
                }

                setTimeout(() => updateActor(field, newArray, { immediate: true }), 0);
                return { ...prev, currentValue: newArray };
            });
        } else {
            updateActor(field, valToStore, { immediate: true });
            setSelectionModal((prev: any) => ({ ...prev, isOpen: false }));
        }
    }
    const cardStyle = "bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-2 relative";
    const cardStyleWithoutPadding = "bg-white border-2 border-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative";

    // REMOVED: resolveField effect. We now handle resolution at render time via resolveEntityName.
    // This allows storing UUIDs properly without overwriting them with strings.

    return (
        <div className="flex flex-col gap-6 h-full overflow-hidden">
            <div className="flex flex-col gap-6 overflow-y-auto pb-20">

                {/* Top Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Level */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Level</span>
                            <div className="w-3" />
                        </div>
                        <div className="p-2 text-center font-serif text-xl font-bold bg-white flex items-center justify-center min-h-[44px]">
                            {actor.computed?.levelUp ? (
                                /* When eligible to level up, render a clickable button just like the header */
                                <button
                                    onClick={triggerLevelUp}
                                    className="bg-amber-500 text-black px-3 py-1 text-sm font-black uppercase tracking-widest animate-pulse shadow-md ring-2 ring-amber-400/50 hover:bg-amber-400 transition-colors w-full"
                                >
                                    LEVEL UP!
                                </button>
                            ) : (
                                <span>
                                    {actor.system?.level?.value ?? 1}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Title</span>
                            <div className="w-3" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {actor.details?.title || '-'}
                        </div>
                    </div>

                    {/* Class */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Class</span>
                            <div className="w-3" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white flex items-center gap-2 font-bold">
                            <span className="w-full">
                                {getClassName()}
                            </span>
                        </div>
                    </div>

                    {/* XP */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">XP</span>
                            <div className="w-3" />
                        </div>
                        <div className={`p-2 flex items-center justify-center gap-2 font-serif text-lg bg-white min-h-[44px] ${(!actor.system?.level?.value || actor.system.level.value === 0) ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                            <input
                                type="number"
                                value={getDraftValue('system.level.xp', actor.system?.level?.xp || 0)}
                                min={0}
                                max={actor.level?.next || 10}
                                disabled={!actor.system?.level?.value || actor.system.level.value === 0}
                                onChange={(e) => {
                                    const nextXP = actor.level?.next || 10;
                                    let val = parseInt(e.target.value) || 0;
                                    if (val < 0) val = 0;
                                    if (val > nextXP) val = nextXP;
                                    updateActor('system.level.xp', val);
                                }}
                                className={`w-12 bg-neutral-100 border-b border-black text-center outline-none px-1 disabled:bg-transparent disabled:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                            />
                            <span className="text-neutral-400">/</span>
                            <span>{actor.level?.next || 10}</span>
                        </div>
                    </div>

                    {/* Ancestry */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                                {fetchingCategory === 'ancestries' && (
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                )}
                            </div>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {actor.details?.ancestry || '-'}
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-serif font-bold text-lg uppercase">Background</span>
                                {fetchingCategory === 'backgrounds' && (
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                )}
                            </div>
                            <button
                                onClick={() => openSelection('system.background', 'Background', 'backgrounds')}
                                className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                Edit
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {actor.details?.background || '-'}
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className={`${cardStyleWithoutPadding} ${(actor.details?.class || '').toLowerCase().includes('warlock')
                        ? 'md:col-span-2 lg:col-span-1'
                        : 'md:col-span-1 lg:col-span-1.5'
                        }`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Alignment</span>
                        </div>
                        <div className="p-1 bg-white">
                            <select
                                className="w-full bg-neutral-50 outline-none cursor-pointer font-serif font-bold text-lg px-1 border border-dashed border-neutral-200"
                                value={actor.system?.alignment || 'neutral'}
                                onChange={(e) => updateActor('system.alignment', e.target.value, { immediate: true })}
                            >
                                <option value="lawful">Lawful</option>
                                <option value="neutral">Neutral</option>
                                <option value="chaotic">Chaotic</option>
                            </select>
                        </div>
                    </div>

                    {/* Deity */}
                    <div className={`${cardStyleWithoutPadding} ${(actor.details?.class || '').toLowerCase().includes('warlock')
                        ? 'md:col-span-1 lg:col-span-1'
                        : 'md:col-span-2 lg:col-span-1.5'
                        }`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="font-serif font-bold text-lg uppercase">Deity</span>
                                {fetchingCategory === 'deities' && (
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                )}
                            </div>
                            <button
                                onClick={() => openSelection('system.deity', 'Deity', 'deities')}
                                className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                Edit
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {actor.computed?.resolvedNames?.deity || resolveName(actor.system?.deity, 'deities') || '-'}
                        </div>
                    </div>

                    {/* Patron (Only for Warlock) */}
                    {(actor.details?.class || '').toLowerCase().includes('warlock') && (
                        <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1`}>
                            <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <span className="font-serif font-bold text-lg uppercase">Patron</span>
                                    {fetchingCategory === 'patrons' && (
                                        <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                                    )}
                                </div>
                                <button
                                    onClick={() => openSelection('system.patron', 'Patron', 'patrons')}
                                    className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    Edit
                                </button>
                            </div>
                            <div className="p-2 font-serif text-lg bg-white font-bold">
                                {actor.computed?.resolvedNames?.patron || resolveName(actor.system?.patron, 'patrons') || '-'}
                            </div>
                        </div>
                    )}
                </div>


                {/* Languages */}
                <div className={cardStyleWithoutPadding}>
                    <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                        <span className="font-serif font-bold text-lg uppercase">Languages</span>
                        <div className="flex items-center gap-2">
                            {(() => {
                                const { maxCommon = 0, maxRare = 0 } = actor.computed?.languageLimits || {};
                                // Split languages by rarity using the centralized helper
                                const allLangs = (actor.system?.languages || []);
                                const currentCommon = allLangs.filter((id: string) => {
                                    const lang = (collections?.languages || systemData?.languages)?.find((l: any) => l.uuid === id || l.name === id);
                                    return !isRareLanguage(resolveName(id, 'languages'));
                                }).length;
                                const currentRare = allLangs.filter((id: string) => {
                                    const lang = (collections?.languages || systemData?.languages)?.find((l: any) => l.uuid === id || l.name === id);
                                    return isRareLanguage(resolveName(id, 'languages'));
                                }).length;

                                const totalCurrent = currentCommon + currentRare;
                                const totalMax = maxCommon + maxRare;

                                return (
                                    <>
                                        <div className="flex items-center gap-1.5 mr-1">
                                            <div
                                                title="Total Languages Limit"
                                                className="bg-neutral-100 text-black text-[10px] px-1.5 py-0.5 border border-black font-bold uppercase tracking-tighter shadow-[1px_1px_0px_0px_rgba(255,255,255,0.3)]"
                                            >
                                                {totalCurrent}/{totalMax}
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!(collections?.languages || systemData?.languages)) {
                                                    setFetchingCategory('languages');
                                                    await fetchPack('languages');
                                                    setFetchingCategory(null);
                                                }
                                                setIsLanguageModalOpen(true);
                                            }}
                                            className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                        >
                                            {fetchingCategory === 'languages' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Edit'}
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                    <div className="p-2 flex flex-wrap gap-2 bg-white">
                        {(() => {
                            const RARE_LANGS = ['celestial', 'diabolic', 'draconic', 'primordial', 'abyssal', 'undercommon'];
                            const actorLangs = actor.system?.languages || [];
                            const resolvedLangs = actorLangs.map((l: any) => {
                                const id = typeof l === 'string' ? l : (l.name || l.uuid || '');
                                // Find extra info in systemData/collections for tooltips
                                const match = (collections?.languages || systemData?.languages)?.find((sl: any) =>
                                    sl.uuid === id || sl.name === id || (typeof id === 'string' && id.endsWith(sl.uuid?.split('.').pop() || ""))
                                );

                                return {
                                    name: match ? match.name : id,
                                    desc: match ? (match.description || match.desc) : (typeof l === 'object' ? (l.description || l.desc) : 'Description unavailable.'),
                                    rarity: match ? match.rarity : (typeof l === 'object' ? l.rarity : 'common')
                                };
                            });

                            return resolvedLangs.sort((a: any, b: any) => a.name.localeCompare(b.name))
                                .map((lang: any, i: number) => {
                                    const isRare = isRareLanguage(lang.name) || lang.rarity?.toLowerCase() === 'rare';
                                    const bgColor = isRare ? 'bg-black' : 'bg-[#78557e]';

                                    // Scrub HTML tags for tooltip
                                    let tooltip = lang.desc && lang.desc !== '<p></p>'
                                        ? lang.desc.replace(/<[^>]*>?/gm, '').trim()
                                        : 'No description.';

                                    if (lang.rarity && lang.rarity !== 'common') {
                                        tooltip += ` (${lang.rarity.charAt(0).toUpperCase() + lang.rarity.slice(1)})`;
                                    }

                                    return (
                                        <div
                                            key={`${lang.name}-${i}`}
                                            className={`group relative flex items-center font-serif text-sm font-medium px-2 py-0.5 text-white shadow-sm border border-white/20 hover:border-white/50 transition-colors ${bgColor}`}
                                            title={tooltip}
                                        >
                                            <span className="cursor-help whitespace-nowrap">{lang.name}</span>
                                        </div>
                                    );
                                });
                        })()}
                        {(!actor.system?.languages || actor.system.languages.length === 0) && <span className="text-neutral-500 text-sm italic">None known</span>}
                    </div>
                </div>

                {/* Boons */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white flex justify-between items-center">
                        <span className="font-serif font-bold text-lg uppercase">Boons</span>
                        <button
                            onClick={() => setIsCreatingBoon(true)}
                            className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            title="Add Boon"
                        >
                            Add
                        </button>
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1 mb-2">
                        <div className="col-span-5">Boon Name</div>
                        <div className="col-span-3">Type</div>
                        <div className="col-span-2 text-center">Level</div>
                        <div className="col-span-2 text-right">Options</div>
                    </div>
                    <div className="divide-y divide-neutral-200">
                        {(actor.items?.filter((i: any) => i.type?.toLowerCase() === 'boon') || [])
                            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                            .map((item: any, i: number) => (
                                <div key={item.id || item._id || `boon-${i}`} className="grid grid-cols-12 py-3 px-2 text-sm font-serif items-center group hover:bg-neutral-50 transition-colors">
                                    <div className="col-span-5 font-bold flex items-center overflow-hidden">
                                        <img
                                            src={resolveImageUrl(item.img)}
                                            alt={item.name}
                                            className="w-8 h-8 object-cover border border-black mr-3 bg-neutral-200 shrink-0"
                                        />
                                        <span className="truncate">{item.name}</span>
                                    </div>
                                    <div className="col-span-3 text-neutral-600 capitalize truncate">{item.system?.boonType || item.system?.type || '-'}</div>
                                    <div className="col-span-2 text-center">{item.system?.level?.value || item.system?.level || '-'}</div>
                                    <div className="col-span-2 flex justify-end gap-2">
                                        {/* Edit Item - ADDED */}
                                        <button
                                            onClick={() => setEditingItem(item)}
                                            className="bg-black text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]"
                                            title="Edit Boon"
                                        >
                                            Edit
                                        </button>
                                        {/* Delete Item */}
                                        <button
                                            onClick={() => setItemToDelete({ id: item.id, name: item.name })}
                                            className="bg-white text-black px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                            title="Delete Boon"
                                        >
                                            Del
                                        </button>
                                    </div>
                                </div>
                            ))}
                        {(!actor.items?.some((i: any) => i.type?.toLowerCase() === 'boon')) && (
                            <div className="text-center text-neutral-400 italic py-4 text-xs">No boons recorded.</div>
                        )}
                    </div>
                </div>
            </div>

            {
                (isCreatingBoon || editingItem) && (
                    <CustomBoonModal
                        isOpen={true}
                        onClose={() => { setIsCreatingBoon(false); setEditingItem(null); }}
                        onCreate={createItem}
                        onUpdate={updateItem}
                        initialData={editingItem}
                        systemConfig={{ ...systemData, ...collections }}
                        predefinedEffects={collections?.PREDEFINED_EFFECTS || systemData?.PREDEFINED_EFFECTS}
                    />
                )
            }

            <ConfirmationModal
                isOpen={!!itemToDelete}
                title="Delete Boon"
                message={`Are you sure you want to delete "${itemToDelete?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                isDanger={true}
                onConfirm={() => {
                    if (itemToDelete) deleteItem(itemToDelete.id);
                    setItemToDelete(null);
                }}
                onCancel={() => setItemToDelete(null)}
                theme={shadowdarkTheme.modal}
            />



            <CompendiumSelectModal
                isOpen={selectionModal.isOpen}
                onClose={() => setSelectionModal((prev: any) => ({ ...prev, isOpen: false }))}
                onSelect={selectionModal.onSelect}
                title={selectionModal.title}
                options={selectionModal.options}
                currentValue={selectionModal.currentValue}
                multiSelect={selectionModal.multiSelect}
            />
            {isLanguageModalOpen && (
                <LanguageSelectionModal
                    isOpen={true}
                    onClose={() => setIsLanguageModalOpen(false)}
                    onSelect={(langs) => {
                        setIsLanguageModalOpen(false);
                        updateActor('system.languages', langs, { immediate: true });
                    }}
                    currentLanguages={actor.system?.languages || []}
                    maxCommon={actor.computed?.languageLimits?.maxCommon || 0}
                    maxRare={actor.computed?.languageLimits?.maxRare || 0}
                />
            )}

            {/* Level-Up Modal — shared state from ShadowdarkActorContext, rendered here for the Details tab Level card */}
            {showLevelUpModal && levelUpData && (
                <LevelUpModal
                    actorId={actor._id || actor.id}
                    actorName={actor.name}
                    currentLevel={levelUpData.currentLevel}
                    targetLevel={levelUpData.targetLevel}
                    ancestry={levelUpData.ancestry}
                    classObj={levelUpData.classObj}
                    classUuid={levelUpData.classUuid}
                    patron={levelUpData.patron}
                    patronUuid={levelUpData.patronUuid}
                    abilities={levelUpData.abilities}
                    spells={levelUpData.spells}
                    availableClasses={levelUpData.availableClasses}
                    availablePatrons={levelUpData.availablePatrons}
                    availableLanguages={levelUpData.availableLanguages}
                    onComplete={async (_data: any) => {
                        await refreshActor();
                        closeLevelUp();
                    }}
                    onCancel={closeLevelUp}
                />
            )}
        </div>

    );
}
