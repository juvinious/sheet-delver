'use client';

import { useState } from 'react';

interface EquipmentTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    onDeleteItem: (itemId: string) => void;
}

export default function EquipmentTab({ actor, onUpdate: _onUpdate, onDeleteItem }: EquipmentTabProps) {
    // Flatten all items except Scrolls/Abilities which go in Special
    // Just show everything here for "Stuff" management if needed, but per tab rules:
    // "Equipment" = Treasures/Items?
    // We will show: Weapons (as list), Armor (as list), Equipment (as list)

    // Helper to calculate slots
    const formatSlots = (slots: number) => slots === 0 ? '-' : slots;

    const renderSection = (title: string, items: any[]) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="mb-6">
                <h3 className="font-morkborg text-2xl uppercase border-b-2 border-stone-800 mb-3 text-neutral-400">
                    {title}
                </h3>
                <div className="space-y-2">
                    {items.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between bg-neutral-900/50 p-2 border border-stone-800/50 hover:border-amber-500/30 transition-colors group">
                            <div className="flex items-center gap-3">
                                <img src={item.img} alt={item.name} className="w-8 h-8 bg-black object-cover border border-stone-700" />
                                <div>
                                    <div className="font-bold text-neutral-200">{item.name}</div>
                                    <div className="text-xs text-neutral-500 font-mono">
                                        {item.system.quantity > 1 ? `Qty: ${item.system.quantity} | ` : ''}
                                        Slots: {formatSlots(item.slots)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => onDeleteItem(item.id)}
                                    className="p-1 hover:text-red-500 text-neutral-600 transition-colors"
                                    title="Discard"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="p-1">
            <div className="bg-black text-neutral-300 p-4 mb-6 border-2 border-stone-800 flex justify-between items-center bg-[url('/textures/paper-texture.png')] bg-opacity-10">
                <div>
                    <span className="font-morkborg text-2xl uppercase text-amber-600 mr-2">Encumbrance</span>
                    <span className={`text-xl font-bold ${actor.computed.encumbered ? 'text-red-500 animate-pulse' : 'text-neutral-400'}`}>
                        {actor.computed.slotsUsed} / {actor.computed.maxSlots}
                    </span>
                </div>
                <div className="text-right">
                    <div className="font-morkborg text-xl uppercase text-amber-600">Silver</div>
                    <div className="font-bold text-2xl text-neutral-200">{actor.computed.silver} s</div>
                </div>
            </div>

            {renderSection("Weapons", actor.items.weapons)}
            {renderSection("Armor", actor.items.armor)}
            {renderSection("Equipment", actor.items.equipment)}

            {/* Show empty state if nothing */}
            {(!actor.items.weapons.length && !actor.items.armor.length && !actor.items.equipment.length) && (
                <div className="text-center py-20 text-neutral-600 font-morkborg text-xl italic">
                    The wretch carries nothing but shame.
                </div>
            )}
        </div>
    );
}
