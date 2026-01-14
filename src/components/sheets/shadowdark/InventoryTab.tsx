'use client';

import { useState } from 'react';
import { SHADOWDARK_EQUIPMENT } from '@/lib/systems/shadowdark-data';
import {
    resolveImage,
    calculateItemSlots,
    calculateMaxSlots,
    formatDescription,
    getSafeDescription
} from './sheet-utils';

interface InventoryTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    onRoll: (type: string, key: string, options?: any) => void;
    onChatSend: (msg: string) => void;
    triggerRollDialog: (type: string, key: string, name?: string) => void;
    foundryUrl?: string;
}

export default function InventoryTab({ actor, onUpdate, onRoll, onChatSend, triggerRollDialog, foundryUrl }: InventoryTabProps) {
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
            } else if (action === 'roll-formula') {
                const formula = rollBtn.getAttribute('data-formula');
                if (formula) onChatSend(`/r ${formula}`);
            }
        }
    };

    const renderItemRow = (item: any) => {
        const isExpanded = expandedItems.has(item.id);

        // Attribute logic
        const light = item.system?.light;
        const isLightSource = light?.isSource || light?.hasLight;
        const isLightActive = light?.active;
        const remaining = light?.remaining;
        const remainingTime = light?.remainingSecs ? `${Math.ceil(light.remainingSecs / 60)}m` : (remaining ? `${remaining}` : null);

        // Also check properties for 'light' keyword if system differs
        const props = item.system?.properties;
        const hasLightProp = Array.isArray(props) ? props.some((p: any) => p.includes('light')) : (props?.light);

        const showLightIndicator = isLightActive || (isLightSource && isLightActive) || (hasLightProp && remaining > 0);

        // Weapon Details
        const isWeapon = item.type === 'Weapon';
        const isArmor = item.type === 'Armor';
        const weaponType = item.system?.type === 'melee' ? 'Melee' : item.system?.type === 'ranged' ? 'Ranged' : '';
        const range = item.system?.range ? item.system?.range.charAt(0).toUpperCase() + item.system?.range.slice(1) : '-';
        const damage = item.system?.damage?.value || `${item.system?.damage?.numDice || 1}d${item.system?.damage?.die || 6}`;

        // Description - handling potential missing fields or rich text
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

        // Item Toggles
        const toggleEquip = (e: React.MouseEvent) => {
            e.stopPropagation();
            onUpdate(`items.${item.id}.system.equipped`, !item.system?.equipped);
        };

        const toggleStash = (e: React.MouseEvent) => {
            e.stopPropagation();
            onUpdate(`items.${item.id}.system.stashed`, !item.system?.stashed);
        };

        const toggleLight = (e: React.MouseEvent) => {
            e.stopPropagation();
            onUpdate(`items.${item.id}.system.light.active`, !item.system?.light?.active);
        };


        return (
            <div
                key={item.id}
                className="group cursor-pointer hover:bg-neutral-100 transition-colors"
                onClick={(e) => {
                    // Check for button clicks first
                    const target = e.target as HTMLElement;
                    const rollBtn = target.closest('button[data-action]');

                    if (rollBtn) {
                        e.stopPropagation();
                        // Handled by handleDescriptionClick bubble up or manual call?
                        // Actually handleDescriptionClick is for the dangerouslySetInnerHTML
                        // This click handler is on the row itself.
                        // We should probably delegate to handleDescriptionClick or reuse logic.
                        // But wait, the row click collapses/expands.
                        // Buttons inside the row (like Equip) have stopPropagation.
                        // Inline rolls are inside the description, which is in the expanded part.
                        // So this block is redundant if we only care about inline rolls in description.
                        // BUT if we had buttons in the summary row...
                        return; // Let the row expand trigger for now unless it was a button
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
                            {showLightIndicator && (
                                <span
                                    title={`Active Light Source: ${remainingTime ? `${remainingTime} remaining` : 'Active'}`}
                                    className="text-amber-500 font-black tracking-tighter text-xs ml-2 cursor-help"
                                >
                                    {isLightActive ? '🔥' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="col-span-2 text-center font-bold text-neutral-500">{item.system?.quantity || 1}</div>
                    <div className="col-span-2 text-center">{calculateItemSlots(item) === 0 ? '-' : calculateItemSlots(item)}</div>
                    <div className="col-span-2 flex justify-center items-center gap-1">
                        {/* Light Toggle */}
                        {(isLightSource || hasLightProp) && (
                            <button
                                onClick={toggleLight}
                                title={isLightActive ? "Extinguish" : "Light"}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${isLightActive ? 'text-amber-600' : 'text-neutral-300'}`}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={isLightActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3a1 1 0 0 1 .9 2.5z"></path>
                                </svg>
                            </button>
                        )}

                        {/* Equip Toggle (For Weapons/Armor/Shields) */}
                        {['Weapon', 'Armor', 'Shield'].includes(item.type) && (
                            <button
                                onClick={toggleEquip}
                                title={item.system?.equipped ? "Unequip" : "Equip"}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${item.system?.equipped ? 'text-green-700 fill-green-700' : 'text-neutral-300'}`}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                </svg>
                            </button>
                        )}

                        {/* Stash Toggle (Hide if Equipped) */}
                        {!item.system?.equipped && (
                            <button
                                onClick={toggleStash}
                                title={item.system?.stashed ? "Retrieve" : "Stash"}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors ${item.system?.stashed ? 'text-blue-600' : 'text-neutral-300'}`}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill={item.system?.stashed ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                                    <path d="m3.3 7 8.7 5 8.7-5"></path>
                                    <path d="M12 22V12"></path>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                    <div className="px-4 pb-3 pt-1 text-xs text-neutral-600 border-t border-neutral-200 bg-neutral-50">

                        {/* Weapon Stats */}
                        {isWeapon && (
                            <div className="grid grid-cols-3 gap-4 mb-2 font-bold font-sans uppercase tracking-widest text-[10px] text-black border-b border-neutral-300 pb-1">
                                <div>Type <span className="text-neutral-500 ml-1">{weaponType}</span></div>
                                <div>Range <span className="text-neutral-500 ml-1">{range}</span></div>
                                <div>Damage <span className="text-neutral-500 ml-1">{damage}</span></div>
                            </div>
                        )}

                        {/* Armor Stats */}
                        {isArmor && (
                            <div className="grid grid-cols-4 gap-4 mb-2 font-bold font-sans uppercase tracking-widest text-[10px] text-black border-b border-neutral-300 pb-1">
                                <div>AC <span className="text-neutral-500 ml-1">{item.system?.ac?.base || item.system?.ac?.value || 10}</span></div>
                                <div>Tier <span className="text-neutral-500 ml-1">{item.system?.tier || '-'}</span></div>
                                <div>Attr <span className="text-neutral-500 ml-1">{item.system?.ac?.attribute ? item.system.ac.attribute.toUpperCase() : '-'}</span></div>
                                <div>Bonus <span className="text-neutral-500 ml-1">{item.system?.ac?.modifier ? (item.system.ac.modifier >= 0 ? `+${item.system.ac.modifier}` : item.system.ac.modifier) : '-'}</span></div>
                            </div>
                        )}

                        {description ? (
                            <div
                                dangerouslySetInnerHTML={{ __html: formatDescription(description) }}
                                className="font-serif leading-relaxed"
                                onClick={handleDescriptionClick}
                            />
                        ) : (
                            <div className="italic text-neutral-400">
                                No description available.
                            </div>
                        )}

                        {/* Properties & Penalties */}
                        {(propertiesDisplay.length > 0 || (isArmor && !item.system?.ac?.attribute)) && (
                            <div className="mt-2 pt-2 border-t border-neutral-200">
                                {isArmor && !item.system?.ac?.attribute && (
                                    <div className="text-red-800 font-bold mb-1 uppercase tracking-wider text-[10px] flex items-center">
                                        <span className="mr-1">⚠️</span> Penalty: No Dex Bonus
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-1">
                                    {propertiesDisplay.map(prop => (
                                        <span key={prop} className="px-1.5 py-0.5 bg-neutral-200 border border-neutral-300 rounded text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                                            {prop}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Inventory: Equipped, Carried, Stashed (Col 1 & 2) */}
            <div className="lg:col-span-2 space-y-6">

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
                        {actor.items?.filter((i: any) => i.system?.equipped).map(renderItemRow)}
                        {(!actor.items?.some((i: any) => i.system?.equipped)) && (
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
                        {actor.items?.filter((i: any) => !i.system?.equipped && !i.system?.stashed && ['Weapon', 'Armor', 'Basic', 'Potion', 'Scroll', 'Wand'].includes(i.type)).map(renderItemRow)}
                        {(!actor.items?.some((i: any) => !i.system?.equipped && !i.system?.stashed && ['Weapon', 'Armor', 'Basic', 'Potion', 'Scroll', 'Wand'].includes(i.type))) && (
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
                        {actor.items?.filter((i: any) => i.system?.stashed && ['Weapon', 'Armor', 'Basic', 'Potion', 'Scroll', 'Wand'].includes(i.type)).map(renderItemRow)}
                        {(!actor.items?.some((i: any) => i.system?.stashed && ['Weapon', 'Armor', 'Basic', 'Potion', 'Scroll', 'Wand'].includes(i.type))) && (
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
                        <span className={`text-3xl font-serif font-black ${(actor.items?.filter((i: any) => !i.system?.stashed).reduce((acc: number, i: any) => acc + calculateItemSlots(i), 0) > calculateMaxSlots(actor)) ? 'text-red-600' : ''}`}>
                            {actor.items?.filter((i: any) => !i.system?.stashed).reduce((acc: number, i: any) => {
                                return acc + calculateItemSlots(i);
                            }, 0)} / {calculateMaxSlots(actor)}
                        </span>
                    </div>
                    <hr className="border-neutral-300 mb-3" />
                    <div className="space-y-1 font-serif text-sm">
                        <div className="flex justify-between">
                            <span>Gear</span>
                            <span className="font-bold">{actor.items?.filter((i: any) => i.type !== 'Gem' && i.type !== 'Treasure' && !i.system?.stashed).reduce((acc: number, i: any) => {
                                return acc + calculateItemSlots(i);
                            }, 0)}</span>
                        </div>
                        <div className="flex justify-between text-neutral-500">
                            <span>Treasure (Free)</span>
                            <span className="font-bold">{actor.items?.filter((i: any) => (i.type === 'Gem' || i.type === 'Treasure') && !i.system?.stashed).reduce((acc: number, i: any) => {
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
                                defaultValue={actor.coins?.gp || 0}
                                onBlur={(e) => onUpdate('system.coins.gp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-neutral-500 font-serif">SP</label>
                            <input
                                type="number"
                                defaultValue={actor.coins?.sp || 0}
                                onBlur={(e) => onUpdate('system.coins.sp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <label className="font-bold text-orange-700 font-serif">CP</label>
                            <input
                                type="number"
                                defaultValue={actor.coins?.cp || 0}
                                onBlur={(e) => onUpdate('system.coins.cp', parseInt(e.target.value))}
                                className="w-20 text-right bg-neutral-100 border-b border-neutral-300 focus:border-black outline-none font-serif text-lg p-1"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
