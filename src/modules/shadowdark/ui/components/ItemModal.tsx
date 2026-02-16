import React, { useState, useEffect } from 'react';
import { X, Flame, Utensils, Shield, Sword, Package, Archive, Minus, Plus } from 'lucide-react';
import { resolveEntityName } from '../sheet-utils';

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: any;
    onUpdate: (path: string, value: any) => void;
    actor: any;
    systemData: any;
}

export default function ItemModal({
    isOpen,
    onClose,
    item: initialItem,
    onUpdate,
    actor,
    systemData
}: ItemModalProps) {
    // Find the actual item in the actor's list to ensure reactivity when parent state updates
    const item = actor?.items?.find((i: any) => (i.id || i._id) === (initialItem?.id || initialItem?._id)) || initialItem;

    const [localQuantity, setLocalQuantity] = useState(item?.system?.quantity || 0);

    // Sync local state when external data changes (e.g. from server or other UI parts)
    useEffect(() => {
        if (item?.system?.quantity !== undefined) {
            setLocalQuantity(item.system.quantity);
        }
    }, [item?.system?.quantity]);

    if (!isOpen || !item) return null;

    const isLightSource = (item: any) => {
        const name = item.name?.toLowerCase() || "";
        return name.includes('torch') || name.includes('lantern') || name.includes('oil');
    };

    const isRation = (item: any) => {
        const name = item.name?.toLowerCase() || "";
        return name.includes('ration');
    };

    const isWeapon = item.type === 'Weapon';
    const isArmor = item.type === 'Armor';

    const getStatusText = (item: any) => {
        if (item.system?.equipped) return 'Equipped';
        if (item.system?.stashed) return 'Stashed';
        return 'Carried';
    };

    const getQualifiers = () => {
        const qualifiers: { label: string; value: string }[] = [];

        if (isWeapon) {
            // Damage
            if (item.system?.damage?.value) {
                qualifiers.push({ label: 'Damage', value: item.system.damage.value });
            } else if (item.system?.damage?.oneHanded) {
                let dmg = item.system.damage.oneHanded;
                if (item.system.damage.twoHanded) dmg += ` / ${item.system.damage.twoHanded} (2H)`;
                qualifiers.push({ label: 'Damage', value: dmg });
            }

            // Range
            if (item.system?.range && item.system.range !== 'none') {
                qualifiers.push({ label: 'Range', value: item.system.range.charAt(0).toUpperCase() + item.system.range.slice(1) });
            }

            // Properties
            if (item.system?.properties?.length > 0) {
                const props = item.system.properties
                    .map((p: any) => {
                        const resolved = resolveEntityName(p, actor, systemData, 'properties');
                        return resolved;
                    })
                    .filter(Boolean)
                    .join(', ');
                if (props) qualifiers.push({ label: 'Properties', value: props });
            }

            // Attack Type
            if (item.system?.type) {
                qualifiers.push({ label: 'Type', value: item.system.type.charAt(0).toUpperCase() + item.system.type.slice(1) });
            }
        }

        if (isArmor) {
            // AC
            if (item.system?.ac?.base) {
                qualifiers.push({ label: 'AC Base', value: item.system.ac.base.toString() });
            }
            if (item.system?.ac?.modifier) {
                qualifiers.push({ label: 'AC Bonus', value: (item.system.ac.modifier >= 0 ? '+' : '') + item.system.ac.modifier });
            }

            // Properties
            if (item.system?.properties?.length > 0) {
                const props = item.system.properties
                    .map((p: any) => resolveEntityName(p, actor, systemData, 'properties'))
                    .filter(Boolean)
                    .join(', ');
                if (props) qualifiers.push({ label: 'Properties', value: props });
            }
        }

        return qualifiers;
    };

    const handleToggleEquip = () => {
        onUpdate(`items.${item.id}.system.equipped`, !item.system?.equipped);
        if (!item.system?.equipped) {
            onUpdate(`items.${item.id}.system.stashed`, false);
        }
        onClose();
    };

    const handleToggleStashed = () => {
        onUpdate(`items.${item.id}.system.stashed`, !item.system?.stashed);
        if (!item.system?.stashed) {
            onUpdate(`items.${item.id}.system.equipped`, false);
        }
        onClose();
    };

    const handleToggleLight = () => {
        onUpdate(`items.${item.id}.system.light.active`, !item.system?.light?.active);
        onClose();
    };

    const handleUseRation = () => {
        const qty = Math.max(0, (item.system?.quantity || 0) - 1);
        onUpdate(`items.${item.id}.system.quantity`, qty);
        onClose();
    };

    const handleIncreaseQuantity = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newVal = (localQuantity || 0) + 1;
        setLocalQuantity(newVal);
        onUpdate(`items.${item.id}.system.quantity`, newVal);
    };

    const handleDecreaseQuantity = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newVal = Math.max(0, (localQuantity || 0) - 1);
        setLocalQuantity(newVal);
        onUpdate(`items.${item.id}.system.quantity`, newVal);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white border-4 border-black w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-black p-4 flex justify-between items-center text-white">
                    <div className="flex items-center gap-3">
                        {isWeapon && <Sword size={20} className="text-neutral-400" />}
                        {isArmor && <Shield size={20} className="text-neutral-400" />}
                        {(!isWeapon && !isArmor) && <Package size={20} className="text-neutral-400" />}
                        <h2 className="text-xl font-serif font-bold tracking-wider uppercase truncate max-w-[250px]">{item.name}</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                    {/* Status Badge */}
                    <div className="flex justify-between items-center bg-neutral-100 p-2 border-2 border-black border-dotted">
                        <span className="text-[10px] uppercase font-black tracking-widest text-neutral-500">Current Status</span>
                        <span className="text-xs font-black text-black uppercase">{getStatusText(item)}</span>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <h3 className="text-[10px] uppercase font-black tracking-widest text-neutral-500 border-b border-black pb-1">Description</h3>
                        <div
                            className="font-serif text-sm leading-relaxed prose prose-sm max-w-none text-black"
                            dangerouslySetInnerHTML={{ __html: item.system?.description || '<p class="italic text-black/50">No description available.</p>' }}
                        />
                    </div>

                    {/* Qualifiers (Weapons/Armor) */}
                    {getQualifiers().length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {getQualifiers().map((q, i) => (
                                <div key={i} className="flex items-center bg-black/5 px-2 py-1 border border-black/20 rounded-sm">
                                    <span className="text-[8px] font-black uppercase tracking-tighter text-black/40 mr-1.5">{q.label}</span>
                                    <span className="text-[10px] font-black uppercase text-black">{q.value}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Stats / Info */}
                    <div className="grid grid-cols-2 gap-4">
                        {(localQuantity > 1 || isRation(item)) && (
                            <div className="bg-neutral-50 border-2 border-black p-2 flex flex-col items-center">
                                <span className="text-[10px] uppercase font-black text-neutral-500">Quantity</span>
                                <div className="flex items-center gap-3 pt-1">
                                    <button
                                        onClick={handleDecreaseQuantity}
                                        className="p-1 hover:bg-neutral-200 border border-black/20 hover:border-black transition-all active:scale-95"
                                    >
                                        <Minus size={12} strokeWidth={3} />
                                    </button>
                                    <span className="text-xl font-black text-black w-6 text-center">{localQuantity}</span>
                                    <button
                                        onClick={handleIncreaseQuantity}
                                        className="p-1 hover:bg-neutral-200 border border-black/20 hover:border-black transition-all active:scale-95"
                                    >
                                        <Plus size={12} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>
                        )}
                        {item.slotsUsed !== undefined && (
                            <div className={`bg-neutral-50 border-2 border-black p-2 flex flex-col items-center ${(item.system?.quantity > 1 || isRation(item)) ? '' : 'col-span-2'}`}>
                                <span className="text-[10px] uppercase font-black text-neutral-500">Slots Used</span>
                                <span className="text-lg font-black text-black">{item.slotsUsed}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions Footer */}
                <div className="p-4 bg-neutral-100 border-t-4 border-black grid grid-cols-2 gap-2">
                    {/* Primary Actions */}
                    {(isWeapon || isArmor) && (
                        <button
                            onClick={handleToggleEquip}
                            className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-black font-bold uppercase tracking-tighter text-xs transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${item.system?.equipped ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-200'}`}
                        >
                            <Shield size={14} />
                            {item.system?.equipped ? 'Unequip' : 'Equip'}
                        </button>
                    )}

                    <button
                        onClick={handleToggleStashed}
                        className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-black font-bold uppercase tracking-tighter text-xs transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${item.system?.stashed ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-200'} ${(!isWeapon && !isArmor) ? 'col-span-2' : ''}`}
                    >
                        <Archive size={14} />
                        {item.system?.stashed ? 'Unstash' : 'Stash'}
                    </button>

                    {/* Context Actions */}
                    {isLightSource(item) && (
                        <button
                            onClick={handleToggleLight}
                            className={`col-span-2 mt-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-black font-black uppercase tracking-widest text-sm transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${item.system?.light?.active ? 'bg-orange-500 text-white border-orange-700' : 'bg-white text-neutral-600 hover:text-black hover:bg-orange-50'}`}
                        >
                            <Flame size={16} fill={item.system?.light?.active ? 'currentColor' : 'none'} />
                            {item.system?.light?.active ? 'Put Out' : 'Strike Light'}
                        </button>
                    )}

                    {isRation(item) && (
                        <button
                            onClick={handleUseRation}
                            disabled={(localQuantity || 0) <= 0}
                            className="col-span-2 mt-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-black bg-white text-black font-black uppercase tracking-widest text-sm transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
                        >
                            <Utensils size={16} />
                            Consume Ration
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
