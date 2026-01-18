'use client';

import { useState, useEffect } from 'react';
import { SHADOWDARK_EQUIPMENT } from '../../system/data';
import {
    resolveImage,
    calculateItemSlots,
    calculateMaxSlots,
    getSafeDescription,
    formatDescription
} from './sheet-utils';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useOptimisticOverrides } from '@/hooks/useOptimisticOverrides';

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

    const equippedItems = applyOverrides(actor.derived?.inventory?.equipped || []);
    const carriedItems = applyOverrides(actor.derived?.inventory?.carried || []);
    const stashedItems = applyOverrides(actor.derived?.inventory?.stashed || []);

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-neutral-500 font-serif">SP</label>
                            <input
                                type="number"
                                defaultValue={actor.system?.coins?.sp || 0}
                                onBlur={(e) => onUpdate('system.coins.sp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-orange-700 font-serif">CP</label>
                            <input
                                type="number"
                                defaultValue={actor.system?.coins?.cp || 0}
                                onBlur={(e) => onUpdate('system.coins.cp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
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

interface QuantityControlProps {
    value: number;
    max: number;
    onChange: (newValue: number) => void;
}

function QuantityControl({ value, max, onChange }: QuantityControlProps) {
    const [displayValue, setDisplayValue] = useState(value);

    // Sync state with props (handles external updates and reversions)
    useEffect(() => {
        setDisplayValue(value);
    }, [value]);

    const handleUpdate = (e: React.MouseEvent, change: number) => {
        e.stopPropagation(); // Stop row expansion

        let newValue = displayValue + change;

        // Clamp
        newValue = Math.max(0, newValue);
        if (max > 1) {
            newValue = Math.min(newValue, max);
        }

        if (newValue === displayValue) return;

        // Optimistic update
        setDisplayValue(newValue);

        // Trigger generic change
        onChange(newValue);
    };

    return (
        <div className="flex items-center gap-1 text-xs bg-neutral-100 rounded px-1">
            <button
                onClick={(e) => handleUpdate(e, -1)}
                className="hover:bg-neutral-300 rounded w-4 h-4 flex items-center justify-center transition-colors"
                disabled={displayValue <= 0}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14" /></svg>
            </button>
            <span className="mx-1">
                {displayValue} <span className="text-neutral-300">/</span> {max}
            </span>
            <button
                onClick={(e) => handleUpdate(e, 1)}
                className="hover:bg-neutral-300 rounded w-4 h-4 flex items-center justify-center transition-colors"
                disabled={max > 1 && displayValue >= max}
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            </button>
        </div>
    );
}

interface ItemRowProps {
    item: any;
    expandedItems: Set<string>;
    toggleItem: (id: string) => void;
    onUpdate: (path: string, value: any) => void;
    foundryUrl?: string;
    onDelete?: (itemId: string) => void;
}

function ItemRow({ item, expandedItems, toggleItem, onUpdate, foundryUrl, onDelete }: ItemRowProps) {
    // Optimistic States
    const [equipped, setEquipped] = useState(item.system?.equipped || false);
    const [stashed, setStashed] = useState(item.system?.stashed || false);
    const [lightActive, setLightActive] = useState(item.system?.light?.active || false);

    // Sync from props
    useEffect(() => { setEquipped(item.system?.equipped || false); }, [item.system?.equipped]);
    useEffect(() => { setStashed(item.system?.stashed || false); }, [item.system?.stashed]);
    useEffect(() => { setLightActive(item.system?.light?.active || false); }, [item.system?.light?.active]);

    const handleToggleEquip = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = !equipped;
        setEquipped(newValue);
        onUpdate(`items.${item.id}.system.equipped`, newValue);
    };

    const handleToggleStash = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = !stashed;
        setStashed(newValue);
        onUpdate(`items.${item.id}.system.stashed`, newValue);
    };

    const handleToggleLight = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = !lightActive;
        setLightActive(newValue);
        onUpdate(`items.${item.id}.system.light.active`, newValue);
    };

    const isExpanded = expandedItems.has(item.id);

    // Attribute logic
    const light = item.system?.light;
    const isLightSource = light?.isSource || light?.hasLight;
    const remaining = light?.remaining;

    // Also check properties for 'light' keyword
    const props = item.system?.properties;
    const hasLightProp = Array.isArray(props) ? props.some((p: any) => p.includes('light')) : (props?.light);

    // Weapon Details
    const isWeapon = item.type === 'Weapon';
    const isArmor = item.type === 'Armor';
    const weaponType = item.system?.type === 'melee' ? 'Melee' : item.system?.type === 'ranged' ? 'Ranged' : '';
    const range = item.system?.range ? item.system?.range.charAt(0).toUpperCase() + item.system?.range.slice(1) : '-';
    // const damage = item.system?.damage?.value || `${item.system?.damage?.numDice || 1}d${item.system?.damage?.die || 6}`;
    const damage = item.system?.damage?.value || `${item.system?.damage?.numDice || 1}d${item.system?.damage?.die || 6}`;

    // Description
    const title = item.name in SHADOWDARK_EQUIPMENT ? SHADOWDARK_EQUIPMENT[item.name] : '';
    const rawDesc = getSafeDescription(item.system);
    const description = rawDesc || title;

    // Properties Logic
    const rawProps = item.system?.properties;
    let propertiesDisplay: string[] = [];
    if (Array.isArray(rawProps)) {
        propertiesDisplay = rawProps.map(String);
    } else if (typeof rawProps === 'object' && rawProps !== null) {
        propertiesDisplay = Object.keys(rawProps).filter(k => rawProps[k]);
    }

    return (
        <div
            className="group cursor-pointer hover:bg-neutral-100 transition-colors"
            onClick={(e) => {
                // Check for button clicks first
                const target = e.target as HTMLElement;
                const rollBtn = target.closest('button[data-action]');
                if (rollBtn) {
                    e.stopPropagation();
                    return;
                }
                toggleItem(item.id);
            }}
        >
            <div className="grid grid-cols-12 p-2 gap-2 items-center font-serif text-sm">
                <div className="col-span-6 font-bold flex items-center">
                    {/* Thumbnail */}
                    <img
                        src={resolveImage(item.img, foundryUrl)}
                        alt={item.name}
                        className="w-6 h-6 object-cover border border-black mr-2 bg-neutral-200"
                    />
                    <div className="flex items-center">
                        <span>{item.name}</span>
                        {/* Light Source Indicator */}
                        {item.isLightSource && (
                            <div className="ml-2 flex items-center gap-1 group/light relative">
                                <span
                                    className={`text-xs tracking-tighter ${lightActive
                                        ? 'text-amber-500 font-bold animate-pulse'
                                        : 'text-neutral-300'
                                        }`}
                                >
                                    {item.lightSourceProgress || (lightActive ? 'Active' : 'Inactive')}
                                    <span className="ml-1 text-[10px] text-neutral-500">
                                        ({item.lightSourceTimeRemaining || (remaining ? `${remaining}m` : '')})
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="col-span-2 text-center font-bold text-neutral-500 flex justify-center items-center gap-1">
                    {(item.system?.slots?.per_slot || 1) > 1 ? (
                        <QuantityControl
                            value={item.system?.quantity ?? 1}
                            max={item.system?.slots?.per_slot || 0}
                            onChange={(val) => onUpdate(`items.${item.id}.system.quantity`, val)}
                        />
                    ) : (
                        item.showQuantity ? (item.system?.quantity || 1) : ''
                    )}
                </div>
                <div className="col-span-2 text-center">{calculateItemSlots(item) === 0 ? '-' : calculateItemSlots(item)}</div>
                <div className="col-span-2 flex justify-center items-center gap-1">
                    {/* Light Toggle (Only if NOT stashed) */}
                    {(!stashed) && (isLightSource || hasLightProp) && (
                        <button
                            onClick={handleToggleLight}
                            title={lightActive ? "Extinguish" : "Light"}
                            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${lightActive ? 'text-amber-600' : 'text-neutral-300'}`}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={lightActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3a1 1 0 0 1 .9 2.5z"></path>
                            </svg>
                        </button>
                    )}

                    {/* Equip Toggle (Only if NOT stashed) */}
                    {(!stashed) && ['Weapon', 'Armor', 'Shield'].includes(item.type) && (
                        <button
                            onClick={handleToggleEquip}
                            title={equipped ? "Unequip" : "Equip"}
                            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${equipped ? 'text-green-700 fill-green-700' : 'text-neutral-300'}`}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                        </button>
                    )}

                    {/* Stash Toggle (Hide if Equipped because equipped items are conceptually 'on person') */}
                    {!equipped && (
                        <button
                            onClick={handleToggleStash}
                            title={stashed ? "Retrieve" : "Stash"}
                            className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${stashed ? 'text-blue-600' : 'text-neutral-300'}`}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={stashed ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                                <path d="m3.3 7 8.7 5 8.7-5"></path>
                                <path d="M12 22V12"></path>
                            </svg>
                        </button>
                    )}

                    {/* Trash / Delete Item (Carried or Stashed only) */}
                    {onDelete && !equipped && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                            }}
                            title="Delete Item"
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-100 text-neutral-300 hover:text-red-600 transition-colors group/trash"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded Description */}
            {isExpanded && (
                <div className="px-4 py-2 bg-neutral-50 text-sm border-t border-b border-neutral-200 col-span-12 font-serif">
                    <div className="flex gap-2 mb-2 text-xs font-bold uppercase text-neutral-500">
                        <span className="bg-neutral-200 px-1 rounded">{item.type}</span>
                        {isWeapon && <span>{weaponType} • {range} • {damage}</span>}
                        {isArmor && <span>AC +{item.system?.ac?.base || 0}</span>}
                        {propertiesDisplay.map(p => (
                            <span key={p} className="bg-neutral-200 px-1 rounded">{p}</span>
                        ))}
                    </div>

                    <div
                        dangerouslySetInnerHTML={{ __html: formatDescription(description) }}
                        className="prose prose-sm max-w-none"
                    />
                </div>
            )}
        </div>
    );
}
