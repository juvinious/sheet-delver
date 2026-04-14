'use client';

import { useState, useEffect } from 'react';
import {
    calculateItemSlots,
} from './sheet-utils';
import { useConfig } from '@client/ui/context/ConfigContext';
import { ConfirmationModal } from '@client/ui/components/ConfirmationModal';
import { shadowdarkTheme } from './themes/shadowdark';
import { ItemRow } from './InventoryComponents';
import GemBagModal from './components/GemBagModal';
import CreateTreasureModal from './components/CreateTreasureModal';
import GearSelectionModal from './components/GearSelectionModal';
import { Gem, Plus } from 'lucide-react';

import { useShadowdarkActor } from './context/ShadowdarkActorContext';

interface InventoryTabProps {
}

export default function InventoryTab({ }: InventoryTabProps) {
    const { resolveImageUrl } = useConfig();
    const {
        actor,
        updateActor,
        deleteItem,
        createItem,
        updateItem,
        getDraftValue
    } = useShadowdarkActor();
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [isGemModalOpen, setIsGemModalOpen] = useState(false);
    const [isCreateTreasureModalOpen, setIsCreateTreasureModalOpen] = useState(false);
    const [isGearSelectionModalOpen, setIsGearSelectionModalOpen] = useState(false);

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

    // Context-provided applyOverrides (Bridge if needed, but here we just use what we have)
    // Actually, InventoryTab was using applyOverrides from useOptimisticOverrides.
    // I should check if I can just use actor.derived?.inventory directly as context handles drafting.
    // This function is now provided by useOptimisticOverrides

    // Exclude non-inventory types
    const NON_INVENTORY_TYPES = ['Patron', 'Talent', 'Effect', 'Background', 'Ancestry', 'Class', 'Deity', 'Title', 'Language', 'Class Ability', 'Gem'];
    const filterInventory = (list: any[]) => list.filter((i: any) => !NON_INVENTORY_TYPES.includes(i.type));

    const equippedItems = filterInventory(actor.derived?.inventory?.equipped || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const carriedItems = filterInventory(actor.derived?.inventory?.carried || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const stashedItems = filterInventory(actor.derived?.inventory?.stashed || []).sort((a: any, b: any) => a.name.localeCompare(b.name));

    // For slot calculation, we need to include gems specifically since they are excluded from the gear lists
    const gems = (actor.items || []).filter((i: any) => i.type === 'Gem');


    // Separate treasure items from regular gear
    const isTreasure = (i: any) => !!i.system?.treasure;
    const isNotTreasure = (i: any) => !i.system?.treasure;

    // Filter the source lists for display
    const displayEquipped = equippedItems.filter(isNotTreasure);
    const displayCarried = carriedItems.filter(isNotTreasure);
    const displayStashed = stashedItems; // Stashed items include treasure if stashed

    // Treasure matches treasure items that are NOT stashed
    // (If they are stashed, they go to Stashed section)
    const treasureItems = [...equippedItems, ...carriedItems]
        .filter(i => isTreasure(i) && !i.system?.stashed)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    // Use pre-computed slot breakdown from the rules engine
    const slotBreakdown = actor.computed?.slotBreakdown || {
        gear: 0,
        treasure: 0,
        gems: 0,
        coins: 0
    };

    const gearSlots = slotBreakdown.gear;
    const treasureSlots = slotBreakdown.treasure;
    const gemSlots = slotBreakdown.gems;
    const coinSlots = slotBreakdown.coins;

    // Use backend computed value for the total to ensure consistency
    const currentSlots = actor.computed?.slotsUsed ?? 0;
    const maxSlots = actor.computed?.maxSlots ?? actor.system?.slots?.max ?? 0;

    // Coin Logic moved to context/getDraftValue



    const handleSellTreasure = async (item: any) => {
        const cost = item.system?.cost || {};
        const gp = Number(cost.gp) || 0;
        const sp = Number(cost.sp) || 0;
        const cp = Number(cost.cp) || 0;

        // Add to actor's coins
        const currentGp = Number(actor.system?.coins?.gp) || 0;
        const currentSp = Number(actor.system?.coins?.sp) || 0;
        const currentCp = Number(actor.system?.coins?.cp) || 0;

        // Update coins via context
        if (gp > 0) updateActor('system.coins.gp', currentGp + gp, { immediate: true });
        if (sp > 0) updateActor('system.coins.sp', currentSp + sp, { immediate: true });
        if (cp > 0) updateActor('system.coins.cp', currentCp + cp, { immediate: true });

        // Delete the item via context
        deleteItem(item.id);
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
                        {displayEquipped.map((item: any, idx: number) => (
                            <ItemRow key={item.id || item._id || `equipped-${idx}`} item={item} expandedItems={expandedItems} toggleItem={toggleItem} />
                        ))}
                        {(displayEquipped.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">Nothing equipped.</div>
                        )}
                    </div>
                </div>

                {/* Carried Gear Section (Not Equipped AND Not Stashed) */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="bg-black text-white p-2 font-bold font-serif uppercase tracking-widest text-sm mb-1 flex justify-between items-center">
                        <span>Carried Gear</span>
                        <button
                            onClick={() => setIsGearSelectionModalOpen(true)}
                            className="bg-white text-black text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-neutral-200 transition-colors"
                        >
                            <Plus size={12} strokeWidth={4} />
                            Add
                        </button>
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">Slots</div>
                        <div className="col-span-2 text-center">Actions</div>
                    </div>
                    <div className="divide-y divide-neutral-300">
                        {displayCarried.map((item: any, idx: number) => (
                            <ItemRow key={item.id || item._id || `carried-${idx}`} item={item} expandedItems={expandedItems} toggleItem={toggleItem} />
                        ))}
                        {(displayCarried.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">Nothing carried.</div>
                        )}
                    </div>
                </div>

                {/* Treasure Section */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="bg-black text-white p-2 font-bold font-serif uppercase tracking-widest text-sm mb-1 flex justify-between items-center">
                        <span>Treasure</span>
                        <button
                            onClick={() => setIsCreateTreasureModalOpen(true)}
                            className="bg-white text-black text-[10px] px-2 py-0.5 rounded-sm flex items-center gap-1 hover:bg-neutral-200 transition-colors"
                        >
                            <Plus size={12} strokeWidth={4} />
                            Add
                        </button>
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1">
                        <div className="col-span-6">Item</div>
                        <div className="col-span-2 text-center">Value</div>
                        <div className="col-span-2 text-center">Slots</div>
                        <div className="col-span-2 text-center">Actions</div>
                    </div>
                    <div className="divide-y divide-neutral-300">
                        {treasureItems.map((item: any, idx: number) => (
                            <ItemRow key={item.id || item._id || `treasure-${idx}`} item={item} expandedItems={expandedItems} toggleItem={toggleItem} isTreasure={true} onSell={handleSellTreasure} />
                        ))}
                        {(treasureItems.length === 0) && (
                            <div className="text-center text-neutral-400 italic p-4 text-xs">No treasure found.</div>
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
                        {displayStashed.map((item: any, idx: number) => (
                            <ItemRow key={item.id || item._id || `stashed-${idx}`} item={item} expandedItems={expandedItems} toggleItem={toggleItem} />
                        ))}
                        {(displayStashed.length === 0) && (
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
                        <span className={`text-3xl font-serif font-black ${currentSlots > maxSlots ? 'text-red-600' : 'text-black'}`}>
                            {currentSlots} / {maxSlots}
                        </span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider">
                            <span className="text-neutral-500">Gear</span>
                            <span>{gearSlots}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider">
                            <span className="text-neutral-500">Treasure</span>
                            <span>{treasureSlots}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider">
                            <span className="text-neutral-500">Gems</span>
                            <span>{gemSlots}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider">
                            <span className="text-neutral-500">Coins</span>
                            <span>{coinSlots}</span>
                        </div>
                    </div>
                </div>

                {/* Coins Panel */}
                <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide flex justify-between items-center">
                        Coins
                        <span className="text-[10px] text-neutral-400 font-sans tracking-tight">100 coins = 1 slot (after first 100)</span>
                    </h3>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-amber-600 font-serif">GP</label>
                            <input
                                type="number"
                                value={getDraftValue('system.coins.gp', actor.system?.coins?.gp || 0)}
                                onChange={(e) => updateActor('system.coins.gp', parseInt(e.target.value) || 0)}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-neutral-500 font-serif">SP</label>
                            <input
                                type="number"
                                value={getDraftValue('system.coins.sp', actor.system?.coins?.sp || 0)}
                                onChange={(e) => updateActor('system.coins.sp', parseInt(e.target.value) || 0)}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-orange-700 font-serif">CP</label>
                            <input
                                type="number"
                                value={getDraftValue('system.coins.cp', actor.system?.coins?.cp || 0)}
                                onChange={(e) => updateActor('system.coins.cp', parseInt(e.target.value) || 0)}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Gems Panel */}
                <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">Gems</h3>
                    <div className="flex justify-between items-baseline mb-3">
                        <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Total</span>
                        <span className="text-3xl font-serif font-black">
                            {(actor.items || []).filter((i: any) => i.type === 'Gem').length}
                        </span>
                    </div>
                    <button
                        onClick={() => setIsGemModalOpen(true)}
                        className="w-full py-2 bg-black text-white font-serif font-bold uppercase tracking-widest text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                        <Gem size={14} />
                        Gem Bag
                    </button>
                </div>
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!itemToDelete}
                title="Delete Item"
                message="Are you sure you want to delete this item? This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => {
                    if (itemToDelete) deleteItem(itemToDelete);
                    setItemToDelete(null);
                }}
                onCancel={() => setItemToDelete(null)}
                theme={shadowdarkTheme.modal}
            />

            {/* Gem Bag Modal */}
            <GemBagModal
                isOpen={isGemModalOpen}
                onClose={() => setIsGemModalOpen(false)}
                actor={actor}
                onUpdate={(path: string, value: any) => updateActor(path, value, { immediate: true })}
                onCreateItem={createItem}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
            />

            {/* Create Treasure Modal */}
            <CreateTreasureModal
                isOpen={isCreateTreasureModalOpen}
                onClose={() => setIsCreateTreasureModalOpen(false)}
                onCreate={(data) => createItem(data)}
            />

            {/* Gear Selection Modal */}
            <GearSelectionModal
                isOpen={isGearSelectionModalOpen}
                onClose={() => setIsGearSelectionModalOpen(false)}
                onCreate={(data) => {
                    setIsGearSelectionModalOpen(false);
                    return createItem(data);
                }}
            />
        </div>
    );
}


