'use client';

import { useState, useEffect } from 'react';
import { SHADOWDARK_EQUIPMENT } from '../data';
import {
    resolveImage,
    calculateItemSlots,
    calculateMaxSlots,
    getSafeDescription,
    formatDescription
} from './sheet-utils';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useOptimisticOverrides } from '@/hooks/useOptimisticOverrides';
import { ItemRow } from './InventoryComponents';

interface InventoryTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    onRoll: (type: string, key: string, options?: any) => void;
    foundryUrl?: string;
    onDeleteItem?: (itemId: string) => void;
}

export default function InventoryTab({ actor, onUpdate, onDeleteItem, foundryUrl }: InventoryTabProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleItem = (id: string) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedItems(newSet);
    };

    // Confirm Delete State
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    // Use the generic hook for optimistic updates
    const { applyOverrides, setOptimistic } = useOptimisticOverrides();

    // Helper to apply optimistic overrides to a list of items
    // This function is now provided by useOptimisticOverrides

    // Exclude non-inventory types
    const NON_INVENTORY_TYPES = ['Patron', 'Talent', 'Effect', 'Background', 'Ancestry', 'Class', 'Deity', 'Title', 'Language', 'Class Ability'];
    const filterInventory = (list: any[]) => list.filter((i: any) => !NON_INVENTORY_TYPES.includes(i.type));

    const equippedItems = applyOverrides(filterInventory(actor.derived?.inventory?.equipped || [])).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const carriedItems = applyOverrides(filterInventory(actor.derived?.inventory?.carried || [])).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const stashedItems = applyOverrides(filterInventory(actor.derived?.inventory?.stashed || [])).sort((a: any, b: any) => a.name.localeCompare(b.name));

    // We rely on the adapter for max slots, but we must re-calculate CURRENT usage based on optimistic updates
    // The adapter gives us 'slots.current', but that doesn't account for local optimistic changes.
    // So we should re-sum the slots from our *optimistic* lists.
    // Re-use calculateItemSlots from sheet-utils because it's available and correct.

    const calculateTotal = (list: any[]) => list.reduce((acc, i) => acc + calculateItemSlots(i), 0);
    const currentSlots = calculateTotal(equippedItems) + calculateTotal(carriedItems); // Stashed don't count
    const maxSlots = actor.derived?.inventory?.slots?.max || calculateMaxSlots(actor);

    const handleOptimisticUpdate = (path: string, value: any) => {
        // Parse path: "items.<id>.system.<prop>"
        // expected format: items.ItemId.system.equipped

        const parts = path.split('.');
        if (parts[0] === 'items' && parts[2] === 'system') {
            const itemId = parts[1];
            // Extract the prop name relative to system.
            // e.g. "equipped" or "light.active"
            // parts[3] is the first prop.

            let prop = parts[3];
            if (prop === 'light' && parts[4] === 'active') {
                prop = 'light.active';
            }

            setOptimistic(itemId, prop, value);
        }

        // Call actual update
        onUpdate(path, value);
    };

    const confirmDelete = (itemId: string) => {
        setItemToDelete(itemId);
    };

    const handleDelete = () => {
        if (!itemToDelete) return;

        // Call parent handler
        if (onDeleteItem) onDeleteItem(itemToDelete);

        setItemToDelete(null);
    };



    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
            {/* MainInventory: Equipped, Carried, Stashed (Col 1 & 2) */}
            <div className="lg:col-span-2 space-y-6">

                {/* Equipped Gear Section */}

                {/* Equipped Gear Section */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="bg-black text-white p-2 font-bold font-serif uppercase tracking-widest text-sm mb-1">
                        Equipped Gear
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1">
                        <div className="col-span-6">Gear</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">Slots</div>
                        <div className="col-span-2 text-center">Actions</div>
                    </div>
                    <div className="divide-y divide-neutral-300">
                        {equippedItems.map((item: any) => (
                            <ItemRow key={item.id} item={item} expandedItems={expandedItems} toggleItem={toggleItem} onUpdate={handleOptimisticUpdate} foundryUrl={foundryUrl} onDelete={confirmDelete} />
                        ))}
                        {(equippedItems.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">Nothing equipped.</div>
                        )}
                    </div>
                </div>

                {/* Carried Gear Section (Not Equipped AND Not Stashed) */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="bg-black text-white p-2 font-bold font-serif uppercase tracking-widest text-sm mb-1">
                        Carried Gear
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">Slots</div>
                        <div className="col-span-2 text-center">Actions</div>
                    </div>
                    <div className="divide-y divide-neutral-300">
                        {carriedItems.map((item: any) => (
                            <ItemRow key={item.id} item={item} expandedItems={expandedItems} toggleItem={toggleItem} onUpdate={handleOptimisticUpdate} foundryUrl={foundryUrl} onDelete={confirmDelete} />
                        ))}
                        {(carriedItems.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">Nothing carried.</div>
                        )}
                    </div>
                </div>

                {/* Stashed Gear Section */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="bg-black text-white p-2 font-bold font-serif uppercase tracking-widest text-sm mb-1">
                        Stashed Gear
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">Slots</div>
                        <div className="col-span-2 text-center">Actions</div>
                    </div>
                    <div className="divide-y divide-neutral-300">
                        {stashedItems.map((item: any) => (
                            <ItemRow key={item.id} item={item} expandedItems={expandedItems} toggleItem={toggleItem} onUpdate={handleOptimisticUpdate} foundryUrl={foundryUrl} onDelete={confirmDelete} />
                        ))}
                        {(stashedItems.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">Nothing stashed.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sidebar with Updated Totals */}
            <div className="lg:col-start-3 row-start-1 lg:row-start-auto flex flex-col gap-6">

                {/* Slots Panel */}
                <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">Slots</h3>
                    <div className="flex justify-between items-baseline mb-3">
                        <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Total</span>
                        <span className={`text-3xl font-serif font-black ${(currentSlots > maxSlots) ? 'text-red-600' : ''}`}>
                            {currentSlots} / {maxSlots}
                        </span>
                    </div>
                    <hr className="border-neutral-300 mb-3" />
                    <div className="space-y-1 font-serif text-sm">
                        <div className="flex justify-between">
                            <span>Gear</span>
                            <span className="font-bold">{[...equippedItems, ...carriedItems].filter((i: any) => i.type !== 'Gem' && i.type !== 'Treasure').reduce((acc: number, i: any) => {
                                return acc + calculateItemSlots(i);
                            }, 0)}</span>
                        </div>
                        <div className="flex justify-between text-neutral-500">
                            <span>Treasure (Free)</span>
                            <span className="font-bold">{[...equippedItems, ...carriedItems].filter((i: any) => i.type === 'Gem' || i.type === 'Treasure').reduce((acc: number, i: any) => {
                                return acc + calculateItemSlots(i);
                            }, 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Coins Panel */}
                <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide flex justify-between items-center">
                        Coins
                        <span className="text-[10px] text-neutral-400 font-sans tracking-tight">10 gp = 1 slot</span>
                    </h3>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-amber-600 font-serif">GP</label>
                            <input
                                type="number"
                                defaultValue={actor.system?.coins?.gp || 0}
                                onBlur={(e) => onUpdate('system.coins.gp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-neutral-500 font-serif">SP</label>
                            <input
                                type="number"
                                defaultValue={actor.system?.coins?.sp || 0}
                                onBlur={(e) => onUpdate('system.coins.sp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-orange-700 font-serif">CP</label>
                            <input
                                type="number"
                                defaultValue={actor.system?.coins?.cp || 0}
                                onBlur={(e) => onUpdate('system.coins.cp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!itemToDelete}
                title="Delete Item"
                message="Are you sure you want to delete this item? This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={handleDelete}
                onCancel={() => setItemToDelete(null)}
            />
        </div>
    );
}


