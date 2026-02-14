'use client';

import { useState, useEffect } from 'react';
import { resolveEntityName } from './sheet-utils';
import { useConfig } from '@/app/ui/context/ConfigContext';
import CustomBoonModal from './components/CustomBoonModal';
import CompendiumSelectModal from './components/CompendiumSelectModal';
import LanguageSelectionModal from './components/LanguageSelectionModal';
import { ConfirmationModal } from '@/app/ui/components/ConfirmationModal';
import { shadowdarkTheme } from '../ui/themes/shadowdark';

interface DetailsTabProps {
    actor: any;
    systemData: any;
    onUpdate: (path: string, value: any) => void;
    foundryUrl?: string;
    onCreateItem?: (itemData: any) => Promise<void>;
    onUpdateItem?: (itemData: any, deletedEffectIds?: string[]) => Promise<void>;
    onDeleteItem?: (itemId: string) => void;
    onToggleEffect?: (effectId: string, enabled: boolean) => void;
}

export default function DetailsTab({ actor, systemData, onUpdate, onCreateItem, onUpdateItem, onDeleteItem }: DetailsTabProps) {
    const { resolveImageUrl } = useConfig();
    const [isCreatingBoon, setIsCreatingBoon] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
    const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

    // Selection Modal State
    const [selectionModal, setSelectionModal] = useState<{
        isOpen: boolean;
        title: string;
        options: any[];
        currentValue: any;
        multiSelect: boolean;
        onSelect: (val: any) => void;
    }>({
        isOpen: false,
        title: '',
        options: [],
        currentValue: '',
        multiSelect: false,
        onSelect: () => { }
    });

    // XP State Sync
    const [xpVal, setXpVal] = useState(actor.system?.level?.xp || 0);

    useEffect(() => {
        setXpVal(actor.system?.level?.xp || 0);
    }, [actor.system?.level?.xp]);

    const openSelection = (field: string, title: string, dataKey?: string, multiSelect = false) => {
        // Resolve options from systemData
        let options: any[] = [];
        if (dataKey && systemData && (systemData as any)[dataKey]) {
            options = (systemData as any)[dataKey];
        }

        // Current Value
        let current: any = '';
        if (field.includes('.')) {
            const parts = field.split('.');
            // simple traversal
            current = actor;
            for (const p of parts) {
                if (current) current = (current as any)[p];
            }
        } else {
            current = actor[field];
        }


        setSelectionModal({
            isOpen: true,
            title,
            options: options.map((o: any) => ({
                name: o.name,
                uuid: o.uuid,
                description: o.description || o.data?.description?.value || ''
            })),
            currentValue: dataKey ? resolveEntityName(current, actor, systemData, dataKey) : current,
            multiSelect,
            onSelect: (option) => {
                const valToStore = option.uuid || option.name;
                // const optName = option.name;

                // Handle Multi-Select (Toggle)
                if (multiSelect) {
                    setSelectionModal(prev => {
                        const currentVal = prev.currentValue;
                        const modalOptions = prev.options;

                        // Sanitize & Normalize to UUIDs
                        // We map existing values (Names or UUIDs) to the authoritative UUIDs from options if available.
                        const cleanArray = (Array.isArray(currentVal) ? currentVal : []).filter((c: any) => c != null).map((c: any) => {
                            const val = typeof c === 'object' ? (c.uuid || c.name) : c;
                            if (!val) return '';

                            // Try to resolve to UUID from options
                            // Value might be "Common" (Name) or "Item.xyz" (UUID)
                            const match = modalOptions.find(o => o.uuid === val || o.name === val);
                            if (match && match.uuid) return match.uuid;

                            return val;
                        }).filter((c: any) => c !== '');

                        // Deduplicate
                        const newArray = Array.from(new Set(cleanArray));

                        // Determine the value to toggle (Prefer UUID)
                        const targetVal = option.uuid || option.name;

                        const existingIndex = newArray.findIndex((c: any) => c === targetVal);

                        if (existingIndex >= 0) {
                            newArray.splice(existingIndex, 1);
                        } else {
                            newArray.push(targetVal);
                        }

                        // Update Backend (Async)
                        setTimeout(() => onUpdate(field, newArray), 0);

                        return { ...prev, currentValue: newArray };
                    });
                } else {
                    // Single Select - Replace
                    onUpdate(field, valToStore);
                    setSelectionModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };


    // Common card style
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
                                <i
                                    className="bg-amber-500 text-black px-2 py-1 text-xs md:text-sm font-bold rounded animate-pulse shadow-lg ring-2 ring-amber-400/50 hover:bg-amber-400 transition-colors"
                                >
                                    LEVEL UP!
                                </i>
                            ) : (
                                <span>{actor.system?.level?.value ?? 1}</span>
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
                            {(() => {
                                const clsName = resolveEntityName(actor.system?.class, actor, systemData, 'classes');
                                const lvl = actor.system?.level?.value ?? 1;
                                const sysTitle = systemData?.titles?.[clsName]?.find((t: any) => lvl >= t.from && lvl <= t.to);
                                const alignment = (actor.system?.alignment || 'neutral').toLowerCase();
                                return actor.system?.title || sysTitle?.[alignment] || '-';
                            })()}
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
                                {resolveEntityName(actor.system?.class, actor, systemData, 'classes') || '-'}
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
                                value={xpVal}
                                min={0}
                                max={actor.level?.next || 10}
                                disabled={!actor.system?.level?.value || actor.system.level.value === 0}
                                onChange={(e) => setXpVal(parseInt(e.target.value) || 0)}
                                onBlur={(e) => {
                                    const nextXP = actor.level?.next || 10;
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 0;
                                    if (val < 0) val = 0;
                                    if (val > nextXP) val = nextXP;
                                    // if (val !== xpVal) setXpVal(val); // Optional local clamp
                                    if (val !== actor.system?.level?.xp) onUpdate('system.level.xp', val);
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
                            <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                            <div className="w-3" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries') || '-'}
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Background</span>
                            <button
                                onClick={() => openSelection('system.background', 'Background', 'backgrounds')}
                                className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                Edit
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {resolveEntityName(actor.system?.background, actor, systemData, 'backgrounds') || '-'}
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
                                onChange={(e) => onUpdate('system.alignment', e.target.value)}
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
                            <span className="font-serif font-bold text-lg uppercase">Deity</span>
                            <button
                                onClick={() => openSelection('system.deity', 'Deity', 'deities')}
                                className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                Edit
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white font-bold">
                            {resolveEntityName(actor.system?.deity, actor, systemData, 'deities') || '-'}
                        </div>
                    </div>

                    {/* Patron (Only for Warlock) */}
                    {(actor.details?.class || '').toLowerCase().includes('warlock') && (
                        <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1`}>
                            <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                                <span className="font-serif font-bold text-lg uppercase">Patron</span>
                                <button
                                    onClick={() => openSelection('system.patron', 'Patron', 'patrons')}
                                    className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    Edit
                                </button>
                            </div>
                            <div className="p-2 font-serif text-lg bg-white font-bold">
                                {actor.details?.patron || resolveEntityName(actor.system?.patron, actor, systemData, 'patrons') || '-'}
                            </div>
                        </div>
                    )}
                </div>


                {/* Languages */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white flex justify-between items-center">
                        <span className="font-serif font-bold text-lg uppercase">Languages</span>
                        <button
                            onClick={() => setIsLanguageModalOpen(true)}
                            className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            title="Edit Languages"
                        >
                            Edit
                        </button>
                    </div>
                    <div className="p-1 flex flex-wrap gap-2">
                        {(() => {
                            const RARE_LANGS = ['celestial', 'diabolic', 'draconic', 'primordial', 'abyssal', 'undercommon'];
                            const actorLangsRaw = actor.system?.languages || [];
                            const resolvedLangs = actorLangsRaw.filter((l: any) => l != null).map((l: any) => {
                                const isObj = typeof l === 'object';
                                const val = isObj ? l.name : l;
                                // Find match in systemData.languages (compendium data)
                                const match = systemData?.languages?.find((sl: any) =>
                                    sl.uuid === val || sl.name === val || sl.uuid === l.uuid
                                );

                                // Robust rarity detection
                                let rarity = match ? match.rarity : (isObj ? l.rarity : null);
                                if (!rarity && val) {
                                    const lowerVal = val.toString().toLowerCase();
                                    if (RARE_LANGS.some(rl => lowerVal.includes(rl))) {
                                        rarity = 'rare';
                                    }
                                }

                                return {
                                    raw: val,
                                    original: l,
                                    name: match ? match.name : (isObj ? l.name : l),
                                    desc: match ? (match.description || match.desc) : (isObj ? (l.description || l.desc) : 'Description unavailable.'),
                                    rarity: rarity || 'common',
                                    uuid: match ? match.uuid : (isObj ? l.uuid : null)
                                };
                            });

                            return resolvedLangs.sort((a: any, b: any) => a.name.localeCompare(b.name))
                                .map((lang: any, i: number) => {
                                    const isRare = lang.rarity?.toLowerCase() === 'rare';
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
                        {onCreateItem && (
                            <button
                                onClick={() => setIsCreatingBoon(true)}
                                className="bg-white text-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                title="Add Boon"
                            >
                                Add
                            </button>
                        )}
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
                                        {onUpdateItem && (
                                            <button
                                                onClick={() => setEditingItem(item)}
                                                className="bg-black text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-800 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]"
                                                title="Edit Boon"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {/* Delete Item */}
                                        {onDeleteItem && (
                                            <button
                                                onClick={() => setItemToDelete({ id: item.id, name: item.name })}
                                                className="bg-white text-black px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-black hover:bg-neutral-200 transition-colors shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                                title="Delete Boon"
                                            >
                                                Del
                                            </button>
                                        )}
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
                (isCreatingBoon || editingItem) && onCreateItem && (
                    <CustomBoonModal
                        isOpen={true}
                        onClose={() => { setIsCreatingBoon(false); setEditingItem(null); }}
                        onCreate={onCreateItem!}
                        onUpdate={onUpdateItem}
                        initialData={editingItem}
                        systemConfig={systemData}
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
                    if (itemToDelete && onDeleteItem) onDeleteItem(itemToDelete.id);
                    setItemToDelete(null);
                }}
                onCancel={() => setItemToDelete(null)}
                theme={shadowdarkTheme.modal}
            />

            <CompendiumSelectModal
                isOpen={selectionModal.isOpen}
                onClose={() => setSelectionModal(prev => ({ ...prev, isOpen: false }))}
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
                        onUpdate('system.languages', langs);
                        setIsLanguageModalOpen(false);
                    }}
                    availableLanguages={systemData?.languages || []}
                    currentLanguages={(actor.system?.languages || []).map((id: string) => {
                        const found = systemData?.languages?.find((l: any) => l.uuid === id || l.name === id);
                        return found?.uuid || id;
                    })}
                    maxCommon={(() => {
                        const findObj = (id: string, list: any[]) => {
                            const embedded = actor.items?.find((i: any) =>
                                i.id === id || i.uuid === id || (typeof id === 'string' && id.endsWith(i.id))
                            );
                            if (embedded) return embedded;
                            return list?.find(i => i.uuid === id || i._id === id || i.name === id || (id?.includes('.') && id.endsWith(i._id)));
                        };

                        const classObj = findObj(actor.system?.class, systemData?.classes);
                        const ancestryObj = findObj(actor.system?.ancestry, systemData?.ancestries);
                        const backgroundObj = findObj(actor.system?.background, systemData?.backgrounds);

                        const cl = classObj?.system?.languages || classObj?.languages || {};
                        const al = ancestryObj?.system?.languages || ancestryObj?.languages || {};
                        const bl = backgroundObj?.system?.languages || backgroundObj?.languages || {};

                        const allFixed = Array.from(new Set([
                            ...(cl.fixed || []),
                            ...(al.fixed || []),
                            ...(bl.fixed || [])
                        ]));

                        const fixedCommon = allFixed.filter(f => {
                            const l = systemData?.languages?.find((lang: any) => lang.name === f || lang.uuid === f);
                            return !l?.rarity || l.rarity === 'common';
                        }).length;

                        return (Number(cl.common) || 0) + (Number(al.common) || 0) + (Number(bl.common) || 0) +
                            (Number(cl.select) || 0) + (Number(al.select) || 0) + (Number(bl.select) || 0) +
                            fixedCommon;
                    })()}
                    maxRare={(() => {
                        const findObj = (id: string, list: any[]) => {
                            const embedded = actor.items?.find((i: any) =>
                                i.id === id || i.uuid === id || (typeof id === 'string' && id.endsWith(i.id))
                            );
                            if (embedded) return embedded;
                            return list?.find(i => i.uuid === id || i._id === id || i.name === id || (id?.includes('.') && id.endsWith(i._id)));
                        };

                        const classObj = findObj(actor.system?.class, systemData?.classes);
                        const ancestryObj = findObj(actor.system?.ancestry, systemData?.ancestries);
                        const backgroundObj = findObj(actor.system?.background, systemData?.backgrounds);

                        const cl = classObj?.system?.languages || classObj?.languages || {};
                        const al = ancestryObj?.system?.languages || ancestryObj?.languages || {};
                        const bl = backgroundObj?.system?.languages || backgroundObj?.languages || {};

                        const allFixed = Array.from(new Set([
                            ...(cl.fixed || []),
                            ...(al.fixed || []),
                            ...(bl.fixed || [])
                        ]));

                        const fixedRare = allFixed.filter(f => {
                            const l = systemData?.languages?.find((lang: any) => lang.name === f || lang.uuid === f);
                            return l?.rarity === 'rare';
                        }).length;

                        return (Number(cl.rare) || 0) + (Number(al.rare) || 0) + (Number(bl.rare) || 0) +
                            fixedRare;
                    })()}
                />
            )}

        </div >

    );
}
