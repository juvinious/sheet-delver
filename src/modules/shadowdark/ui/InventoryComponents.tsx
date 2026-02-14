'use client';

import { useState, useEffect } from 'react';
import {
    calculateItemSlots,
    getSafeDescription,
    formatDescription
} from './sheet-utils';
import { useConfig } from '@/app/ui/context/ConfigContext';


export interface QuantityControlProps {
    value: number;
    max: number;
    onChange: (newValue: number) => void;
}

export function QuantityControl({ value, max, onChange }: QuantityControlProps) {
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
                className="hover:bg-neutral-300 rounded w-8 h-8 flex items-center justify-center transition-colors touch-manipulation"
                disabled={displayValue <= 0}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14" /></svg>
            </button>
            <span className="mx-1 min-w-[30px] text-center font-bold">
                {displayValue} <span className="text-neutral-300">/</span> {max}
            </span>
            <button
                onClick={(e) => handleUpdate(e, 1)}
                className="hover:bg-neutral-300 rounded w-8 h-8 flex items-center justify-center transition-colors touch-manipulation"
                disabled={max > 1 && displayValue >= max}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            </button>
        </div>
    );
}

export interface ItemRowProps {
    item: any;
    expandedItems: Set<string>;
    toggleItem: (id: string) => void;
    onUpdate: (path: string, value: any) => void;
    onDelete?: (itemId: string) => void;
    isTreasure?: boolean;
    onSell?: (item: any) => void;
}

export function ItemRow({ item, expandedItems, toggleItem, onUpdate, onDelete, isTreasure, onSell }: ItemRowProps) {
    const { resolveImageUrl } = useConfig();
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
        onUpdate(`items.${itemId}.system.equipped`, newValue);
    };

    const handleToggleStash = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = !stashed;
        setStashed(newValue);
        onUpdate(`items.${itemId}.system.stashed`, newValue);
    };

    const handleToggleLight = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newValue = !lightActive;
        setLightActive(newValue);
        onUpdate(`items.${itemId}.system.light.active`, newValue);
    };

    const itemId = item.id || item._id;
    const isExpanded = expandedItems.has(itemId);

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
    const rawDesc = getSafeDescription(item.system);
    const description = rawDesc;

    // Properties Logic
    const rawProps = item.system?.properties;
    let propertiesDisplay: string[] = [];
    if (Array.isArray(rawProps)) {
        propertiesDisplay = rawProps.map(String);
    } else if (typeof rawProps === 'object' && rawProps !== null) {
        propertiesDisplay = Object.keys(rawProps).filter(k => rawProps[k]);
    }

    // Cost Formatter
    const formatCost = (cost: any) => {
        if (!cost) return '-';
        const parts = [];
        if (cost.gp) parts.push(`${cost.gp} gp`);
        if (cost.sp) parts.push(`${cost.sp} sp`);
        if (cost.cp) parts.push(`${cost.cp} cp`);
        return parts.length > 0 ? parts.join(', ') : '-';
    };

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
                toggleItem(itemId);
            }}
        >
            <div className="grid grid-cols-12 p-2 gap-2 items-center font-serif text-sm">
                <div className="col-span-6 font-bold flex items-center">
                    {/* Thumbnail */}
                    <img
                        src={resolveImageUrl(item.img)}
                        alt={item.name}
                        className="w-8 h-8 object-cover border border-black mr-2 bg-neutral-200"
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
                    {isTreasure ? (
                        <span className="text-amber-600">{formatCost(item.system?.cost)}</span>
                    ) : (
                        (item.system?.slots?.per_slot || 1) > 1 ? (
                            <QuantityControl
                                value={item.system?.quantity ?? 1}
                                max={item.system?.slots?.per_slot || 0}
                                onChange={(val) => onUpdate(`items.${itemId}.system.quantity`, val)}
                            />
                        ) : (
                            item.showQuantity ? (item.system?.quantity || 1) : ''
                        )
                    )}
                </div>
                <div className="col-span-2 text-center">{calculateItemSlots(item) === 0 ? '-' : calculateItemSlots(item)}</div>
                <div className="col-span-2 flex justify-center items-center gap-1">
                    {/* Light Toggle (Only if NOT stashed) */}
                    {(!stashed) && (isLightSource || hasLightProp) && (
                        <button
                            onClick={handleToggleLight}
                            title={lightActive ? "Extinguish" : "Light"}
                            className={`w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors touch-manipulation ${lightActive ? 'text-amber-600' : 'text-neutral-300'}`}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={lightActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3a1 1 0 0 1 .9 2.5z"></path>
                            </svg>
                        </button>
                    )}

                    {/* Equip Toggle (Only if NOT stashed) */}
                    {(!stashed) && ['Weapon', 'Armor', 'Shield'].includes(item.type) && (
                        <button
                            onClick={handleToggleEquip}
                            title={equipped ? "Unequip" : "Equip"}
                            className={`w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors touch-manipulation ${equipped ? 'text-green-700 fill-green-700' : 'text-neutral-300'}`}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                        </button>
                    )}

                    {/* Stash Toggle (Hide if Equipped because equipped items are conceptually 'on person') */}
                    {!equipped && (
                        <button
                            onClick={handleToggleStash}
                            title={stashed ? "Retrieve" : "Stash"}
                            className={`w-10 h-10 flex items-center justify-center rounded hover:bg-neutral-200 transition-colors touch-manipulation ${stashed ? 'text-blue-600' : 'text-neutral-300'}`}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={stashed ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                                <path d="m3.3 7 8.7 5 8.7-5"></path>
                                <path d="M12 22V12"></path>
                            </svg>
                        </button>
                    )}

                    {/* Sell Button (Treasure Only) */}
                    {isTreasure && onSell && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSell(item);
                            }}
                            title="Sell Treasure"
                            className="w-10 h-10 flex items-center justify-center rounded hover:bg-amber-100 text-neutral-300 hover:text-amber-600 transition-colors group/sell touch-manipulation"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="8" cy="8" r="6" />
                                <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
                                <path d="M7 6h1v4" />
                                <path d="m16.71 13.88.7 .71-2.82 2.82" />
                            </svg>
                        </button>
                    )}

                    {/* Trash / Delete Item (Carried or Stashed only) */}
                    {onDelete && !equipped && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(itemId);
                            }}
                            title="Delete Item"
                            className="w-10 h-10 flex items-center justify-center rounded hover:bg-red-100 text-neutral-300 hover:text-red-600 transition-colors group/trash touch-manipulation"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        {propertiesDisplay.map((p, pIdx) => (
                            <span key={`${p}-${pIdx}`} className="bg-neutral-200 px-1 rounded">{p}</span>
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
