'use client';

import { useEffect, useState } from 'react';
import { resolveImage, resolveEntityName } from './sheet-utils';
import CustomBoonModal from './components/CustomBoonModal';
import CompendiumSelectModal from './components/CompendiumSelectModal';
import { Trash2, Power, Pencil } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

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

export default function DetailsTab({ actor, systemData, onUpdate, foundryUrl, onCreateItem, onUpdateItem, onDeleteItem, onToggleEffect }: DetailsTabProps) {
    const [isCreatingBoon, setIsCreatingBoon] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);

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
            currentValue: current,
            multiSelect,
            onSelect: (option) => {
                const valToStore = option.uuid || option.name;
                const optName = option.name;

                // Handle Multi-Select (Toggle)
                if (multiSelect) {
                    setSelectionModal(prev => {
                        const currentVal = prev.currentValue;
                        const modalOptions = prev.options;

                        // Sanitize & Normalize to UUIDs
                        // We map existing values (Names or UUIDs) to the authoritative UUIDs from options if available.
                        const cleanArray = (Array.isArray(currentVal) ? currentVal : []).filter((c: any) => c != null).map((c: any) => {
                            let val = typeof c === 'object' ? (c.uuid || c.name) : c;
                            if (!val) return '';

                            // Try to resolve to UUID from options
                            // Value might be "Common" (Name) or "Item.xyz" (UUID)
                            const match = modalOptions.find(o => o.uuid === val || o.name === val);
                            if (match && match.uuid) return match.uuid;

                            return val;
                        }).filter((c: any) => c !== '');

                        // Deduplicate
                        let newArray = Array.from(new Set(cleanArray));

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
                            {/* Level is not editable via modal usually, handled by XP? Or maybe direct edit if needed */}
                            {/* Keeping level display-only or XP driven for now as per previous logic */}
                            <div className="w-3" />
                        </div>
                        <div className="p-2 text-center font-serif text-xl font-bold bg-white flex items-center justify-center min-h-[44px]">
                            {actor.computed?.levelUp ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="w-8 h-8 text-emerald-600 animate-bounce"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                >
                                    <title>Level Up Available!</title>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                            ) : (
                                <span>{actor.system?.level?.value ?? 1}</span>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Title</span>
                            <div className="w-3" /> {/* Spacer instead of edit icon */}
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
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
                            <div className="w-3" /> {/* Spacer instead of edit icon */}
                        </div>
                        <div className="p-2 font-serif text-lg bg-white flex items-center gap-2">
                            <i className="fas fa-book text-neutral-400"></i>
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
                                defaultValue={actor.system?.level?.xp || 0}
                                min={0}
                                max={(actor.system?.level?.value || 1) * 10}
                                disabled={!actor.system?.level?.value || actor.system.level.value === 0}
                                onBlur={(e) => {
                                    const nextXP = (actor.system?.level?.value || 1) * 10;
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 0;
                                    if (val < 0) val = 0;
                                    if (val > nextXP) val = nextXP;
                                    if (val.toString() !== e.target.value) e.target.value = val.toString();
                                    if (val !== actor.system?.level?.xp) onUpdate('system.level.xp', val);
                                }}
                                className={`w-12 bg-neutral-200/50 border-b border-black text-center outline-none rounded px-1 disabled:bg-transparent disabled:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                            />
                            <span className="text-neutral-400">/</span>
                            <span>{(actor.system?.level?.value || 1) * 10}</span>
                        </div>
                    </div>

                    {/* Ancestry */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                            <div className="w-3" /> {/* Spacer instead of edit icon */}
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <span>
                                {resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries') || '-'}
                            </span>
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Background</span>
                            <button
                                onClick={() => openSelection('system.background', 'Background', 'backgrounds')}
                                className="text-white/50 hover:text-white transition-colors"
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <span>
                                {resolveEntityName(actor.system?.background, actor, systemData, 'backgrounds') || '-'}
                            </span>
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className={`${cardStyleWithoutPadding} ${(actor.details?.class || '').toLowerCase().includes('warlock')
                        ? 'md:col-span-2 lg:col-span-1'
                        : 'md:col-span-1 lg:col-span-1.5'
                        }`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Alignment</span>
                            {/* Kept as select for now as it makes more sense than a modal for 3 options */}
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <select
                                className="w-full bg-transparent outline-none cursor-pointer"
                                defaultValue={actor.system?.alignment || 'neutral'}
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
                                className="text-white/50 hover:text-white transition-colors"
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <span>{resolveEntityName(actor.system?.deity, actor, systemData, 'deities') || '-'}</span>
                        </div>
                    </div>

                    {/* Patron (Only for Warlock) */}
                    {(actor.details?.class || '').toLowerCase().includes('warlock') && (
                        <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1`}>
                            <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                                <span className="font-serif font-bold text-lg uppercase">Patron</span>
                                <button
                                    onClick={() => openSelection('system.patron', 'Patron', 'patrons')}
                                    className="text-white/50 hover:text-white transition-colors"
                                >
                                    <Pencil size={14} />
                                </button>
                            </div>
                            <div className="p-2 font-serif text-lg bg-white">
                                {(() => {
                                    const patronItem = (actor.items || []).find((i: any) => i.type?.toLowerCase() === 'patron');
                                    // Resolving Logic
                                    const val = actor.system?.patron;
                                    const resolvedName = resolveEntityName(val, actor, systemData, 'patrons');
                                    const displayName = patronItem ? patronItem.name : (resolvedName || '-');

                                    return <span>{displayName}</span>;
                                })()}
                            </div>
                        </div>
                    )}
                </div>


                {/* Languages */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white flex justify-between items-center">
                        <span className="font-serif font-bold text-lg uppercase">Languages</span>
                        <button
                            onClick={() => openSelection('system.languages', 'Languages', 'languages', true)}
                            className="w-6 h-6 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                            title="Edit Languages"
                        >
                            <Pencil size={14} />
                        </button>
                    </div>
                    <div className="p-1 flex flex-wrap gap-2">
                        {(() => {
                            const actorLangsRaw = actor.system?.languages || [];
                            const resolvedLangs = actorLangsRaw.filter((l: any) => l != null).map((l: any) => {
                                const isObj = typeof l === 'object';
                                const val = isObj ? l.name : l;
                                const match = systemData?.languages?.find((sl: any) => sl.uuid === val || sl.name === val);
                                return {
                                    raw: val, // Keep track of the actual specific value in the array to remove it correctly
                                    original: l,
                                    name: match ? match.name : val,
                                    desc: match ? match.description : (isObj ? l.description : 'Description unavailable.'),
                                    rarity: match ? match.rarity : 'common',
                                    uuid: match ? match.uuid : null
                                };
                            });

                            return resolvedLangs.sort((a: any, b: any) => a.name.localeCompare(b.name))
                                .map((lang: any, i: number) => {
                                    const isCommon = lang.rarity?.toLowerCase() === 'common';
                                    const bgColor = isCommon ? 'bg-[#78557e]' : 'bg-black';

                                    let tooltip = lang.desc && lang.desc !== '<p></p>' ? lang.desc.replace(/<[^>]*>?/gm, '') : 'No description.';
                                    if (lang.rarity) tooltip += ` (${lang.rarity})`;

                                    return (
                                        <div
                                            key={i}
                                            className={`group relative flex items-center font-serif text-sm font-medium px-2 py-0.5 text-white shadow-sm ${bgColor}`}
                                            title={tooltip}
                                        >
                                            <span className="cursor-help">{lang.name}</span>
                                        </div>
                                    );
                                });
                        })()}
                        {(!actor.system?.languages || actor.system.languages.length === 0) && <span className="text-neutral-500 text-sm italic">None known</span>}
                    </div>
                </div>

                {/* Boons */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-2 mb-2 -mx-4 -mt-4 border-b-2 border-white flex justify-between items-center pl-4">
                        <span className="font-bold font-serif uppercase tracking-widest text-lg">Boons</span>
                        {onCreateItem && (
                            <button
                                onClick={() => setIsCreatingBoon(true)}
                                className="w-10 h-10 flex items-center justify-center text-white hover:text-amber-400 transition-colors active:scale-95 touch-manipulation"
                                title="Add Boon"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
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
                            .sort((a: any, b: any) => a.name.localeCompare(b.name))
                            .map((item: any) => (
                                <div key={item.id} className="grid grid-cols-12 py-3 px-2 text-sm font-serif items-center group hover:bg-neutral-50 transition-colors">
                                    <div className="col-span-5 font-bold flex items-center overflow-hidden">
                                        <img
                                            src={resolveImage(item.img, foundryUrl)}
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
                                                className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-amber-500 hover:bg-neutral-800 rounded transition-colors touch-manipulation"
                                                title="Edit Boon"
                                            >
                                                <Pencil size={16} className="opacity-75 group-hover:opacity-100" />
                                            </button>
                                        )}
                                        {/* Delete Item */}
                                        {onDeleteItem && (
                                            <button
                                                onClick={() => setItemToDelete({ id: item.id, name: item.name })}
                                                className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-neutral-800 rounded transition-colors touch-manipulation"
                                                title="Delete Boon"
                                            >
                                                <Trash2 size={18} />
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
                        foundryUrl={foundryUrl}
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

        </div >

    );
}
