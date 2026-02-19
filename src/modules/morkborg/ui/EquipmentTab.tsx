import React, { useState } from 'react';
import paperTexture from './assets/paper-texture.png';
import RollModal from './components/RollModal';
import ItemModal from './components/ItemModal';
import { Swords, Shield, Pencil, Trash2, User } from 'lucide-react';

interface EquipmentTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onDeleteItem: (itemId: string) => void;
    onUpdateItem?: (itemData: any) => void;
}

export default function EquipmentTab({ actor, onRoll, onUpdate, onDeleteItem }: EquipmentTabProps) {
    const [rollModalConfig, setRollModalConfig] = useState<{ isOpen: boolean; title: string; item: any; type: 'attack' | 'defend' }>({
        isOpen: false,
        title: '',
        item: null,
        type: 'attack'
    });

    const [itemModalConfig, setItemModalConfig] = useState<{ isOpen: boolean; item: any }>({
        isOpen: false,
        item: null
    });

    const openRollModal = (item: any, type: 'attack' | 'defend') => {
        setRollModalConfig({
            isOpen: true,
            title: type === 'attack' ? 'Attack' : 'Defend',
            item,
            type
        });
    };

    const openItemModal = (item: any) => {
        setItemModalConfig({
            isOpen: true,
            item
        });
    };

    const handleUpdateItem = (path: string, value: any) => {
        if (!itemModalConfig.item) return;

        // This usually goes to the server/foundry
        // For now we use onUpdate which might need to be item-specific
        // But the user prompt says "hook up later" for Add, so we just pass to onUpdate
        // Actually onUpdate in MorkBorgSheet is for actor properties.
        // We might need a separate onUpdateItem prop.
        onUpdate(`items.${itemModalConfig.item._id || itemModalConfig.item.id}.${path}`, value);
    };

    const handleQuantityChange = (item: any, delta: number) => {
        const currentQty = Number(item.quantity || item.system?.quantity || 1);
        const newQty = Math.max(0, currentQty + delta);
        onUpdate(`items.${item._id || item.id}.system.quantity`, newQty);
    };

    const handleToggleCarry = (item: any) => {
        const newStatus = !(item.system?.carried || item.carried);
        onUpdate(`items.${item._id || item.id}.system.carried`, newStatus);
    };

    const handleToggleEquipped = (item: any) => {
        const newStatus = !(item.system?.equipped || item.equipped);
        onUpdate(`items.${item._id || item.id}.system.equipped`, newStatus);
    };

    // Consolidate and sort items
    const allItems = [
        ...(actor.items.weapons || []),
        ...(actor.items.armor || []),
        ...(actor.items.equipment || []),
        ...(actor.items.misc || []),
        ...(actor.items.ammo || [])
    ];

    const allEquipment = allItems.sort((a, b) => a.name.localeCompare(b.name));

    // Identify nested items (those with a container ID)
    // In many MB systems, it's system.location or system.container
    const containers = allEquipment.filter(i => i.type === 'container');
    const topLevelItems = allEquipment.filter(i => !i.system?.containerId && i.type !== 'feat' && i.type !== 'scroll');

    const renderItemRow = (item: any, isNested: boolean = false, index: number) => {
        const isContainer = item.type === 'container';
        const quantity = Number(item.quantity || item.system?.quantity || 1);
        const slots = item.system?.carryWeight || item.weight || 0;
        const isEquipped = item.system?.equipped || item.equipped;
        const isCarried = item.system?.carried || item.carried;

        const toggleTitle = item.type === 'container'
            ? (isCarried ? 'Uncarry' : 'Carry')
            : (isEquipped ? 'Unequip' : 'Equip');

        return (
            <div
                key={(item._id || item.id) + index}
                className={`flex items-center justify-between bg-black border-b border-white/20 group hover:bg-neutral-900 transition-colors my-2 py-4 ${index % 2 === 0 ? 'rotate-1' : '-rotate-1'} ${isNested ? 'ml-8 bg-neutral-900/40' : 'p-3'}`}
            >
                <div className="flex items-center gap-4 flex-1">
                    <img
                        src={item.img}
                        alt={item.name}
                        className="w-10 h-10 object-contain"
                    />
                    <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                            <span className="font-morkborg text-xl tracking-tight text-neutral-200 uppercase">
                                {item.name}
                                {quantity > 1 && <span className="text-white ml-2 opacity-100">({quantity})</span>}
                                {isContainer && (
                                    <span className="text-yellow-500 ml-2">
                                        ({item.system?.slotsUsed || 0} / {item.system?.capacity || 7})
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Quantity Controls */}
                    {(item.type === 'misc' || item.type === 'ammo') && (
                        <div className="flex items-center mr-4">
                            <button
                                onClick={() => handleQuantityChange(item, -1)}
                                className="w-14 h-14 flex items-center justify-center text-4xl text-white hover:text-pink-500 transition-colors font-bold"
                            >
                                −
                            </button>
                            <button
                                onClick={() => handleQuantityChange(item, 1)}
                                className="w-14 h-14 flex items-center justify-center text-4xl text-white hover:text-pink-500 transition-colors font-bold"
                            >
                                +
                            </button>
                        </div>
                    )}

                    {/* container */}
                    {(item.type === 'container') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleToggleCarry(item); }}
                            className={`w-12 h-12 flex items-center justify-center transition-all bg-transparent border-none outline-none ${isCarried ? 'text-yellow-500 drop-shadow-[0_0_8px_#ea7108]' : 'text-white'}`}
                            title={toggleTitle}
                        >
                            <User className="w-8 h-8" />
                        </button>
                    )}

                    {/* Equip/Carry Toggle - Clear White/Yellow SVG icons */}
                    {(item.type === 'weapon' || item.type === 'armor') && (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleToggleEquipped(item); }}
                            className={`w-12 h-12 flex items-center justify-center transition-all bg-transparent border-none outline-none ${isEquipped ? 'text-yellow-500 drop-shadow-[0_0_8px_#ea7108]' : 'text-white'}`}
                            title={toggleTitle}
                        >
                            {item.type === 'weapon' ? (
                                <Swords className="w-8 h-8" />
                                //) : item.type === 'armor' ? (
                            ) : (
                                <Shield className="w-8 h-8" />
                            )}
                        </button>
                    )}

                    {/* Edit Button - Simple Monochrome SVG */}
                    <button
                        onClick={() => openItemModal(item)}
                        className="w-12 h-12 flex items-center justify-center text-white hover:text-yellow-500 transition-colors"
                    >
                        <Pencil className="w-7 h-7" />
                    </button>

                    {/* Delete Button - Simple Monochrome SVG */}
                    <button
                        onClick={() => onDeleteItem(item._id || item.id)}
                        className="w-12 h-12 flex items-center justify-center text-white hover:text-red-500 transition-colors"
                    >
                        <Trash2 className="w-7 h-7" />
                    </button>
                </div>
            </div >
        );
    };

    return (
        <div className="p-1 min-h-[500px]">
            {/* Header / Carrying Capacity */}
            <div
                className="bg-black text-neutral-300 p-4 mb-8 border-2 border-pink-900/30 flex justify-between items-center transform -rotate-1 shadow-lg"
                style={{ backgroundImage: `url(${paperTexture.src})`, backgroundSize: 'cover', backgroundBlendMode: 'overlay' }}
            >
                <div>
                    <div className="flex items-baseline gap-2">
                        <span className="font-morkborg text-2xl uppercase text-pink-500 leading-none mb-1">Carrying</span>
                        <div className={`text-2xl font-bold font-mono tracking-tighter ${actor.derived?.encumbered ? 'text-red-500 animate-pulse' : 'text-neutral-200'}`}>
                            {actor.derived?.slotsUsed} <span className="text-white/20">/</span> {actor.derived?.maxSlots}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="font-morkborg text-xl uppercase text-pink-500 mb-0.5 leading-none">Silver</div>
                    <div className="font-bold text-2xl text-neutral-200 font-mono tracking-tight">{actor.derived?.silver}<span className="text-sm ml-1 text-white/40 uppercase font-bold tracking-widest">s</span></div>
                </div>
            </div>

            {/* Equipment Header */}
            <div className="flex items-center justify-between mb-4 border-b-4 border-pink-500 pb-2">
                <h3 className="font-morkborg text-4xl uppercase text-black tracking-widest transform -rotate-2">
                    Equipment
                </h3>
                <button
                    className="font-morkborg text-2xl text-neutral-900 bg-pink-500 px-4 py-1 hover:bg-white transition-all transform rotate-2 hover:rotate-0"
                    onClick={() => {/* Hook up later */ }}
                >
                    Add +
                </button>
            </div>

            {/* Combined List */}
            <div className="flex flex-col mb-20">
                {(() => {
                    const flatList: { item: any; isNested: boolean }[] = [];
                    topLevelItems.forEach(item => {
                        flatList.push({ item, isNested: false });
                        if (item.type === 'container') {
                            const nested = allEquipment
                                .filter(i => i.system?.containerId === (item._id || item.id))
                                .sort((a, b) => a.name.localeCompare(b.name));
                            nested.forEach(n => flatList.push({ item: n, isNested: true }));
                        }
                    });

                    if (flatList.length === 0) {
                        return (
                            <div className="text-center py-20 text-white/20 font-morkborg text-2xl uppercase tracking-[0.2em]">
                                Your pockets are empty as your soul.
                            </div>
                        );
                    }

                    return flatList.map((entry, index) => renderItemRow(entry.item, entry.isNested, index));
                })()}
            </div>

            {/* Modals */}
            {rollModalConfig.isOpen && (
                <RollModal
                    isOpen={rollModalConfig.isOpen}
                    onClose={() => setRollModalConfig({ ...rollModalConfig, isOpen: false })}
                    onRoll={onRoll}
                    title={rollModalConfig.title}
                    item={rollModalConfig.item}
                    actor={actor}
                    type={rollModalConfig.type}
                />
            )}

            {itemModalConfig.isOpen && (
                <ItemModal
                    isOpen={itemModalConfig.isOpen}
                    onClose={() => setItemModalConfig({ ...itemModalConfig, isOpen: false })}
                    onUpdate={handleUpdateItem}
                    item={itemModalConfig.item}
                    actor={actor}
                />
            )}
        </div>
    );
}
