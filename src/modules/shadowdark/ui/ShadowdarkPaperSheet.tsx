'use client';

import { useState, useRef } from 'react';
import {
    resolveEntityName,
    resolveEntityUuid
} from './sheet-utils';
import { Flame, Utensils, Info, Check } from 'lucide-react';
import ItemModal from './components/ItemModal';
import { logger } from '@/core/logger';
/* eslint-disable @next/next/no-img-element */

interface ShadowdarkPaperSheetProps {
    actor: any;
    systemData: any;
    onUpdate: (path: string, value: any) => void;
    onToggleView: () => void;
    triggerRollDialog: (type: string, key: string, options?: any) => void;
    onRoll: (type: string, key: string, options?: any) => void;
}

export default function ShadowdarkPaperSheet({ actor, systemData, onUpdate, onToggleView, triggerRollDialog, onRoll }: ShadowdarkPaperSheetProps) {
    const [selectedItem, setSelectedItem] = useState<any>(null);
    // Helper to safely render values that might be objects (Foundry data structure)
    const getDisplayValue = (val: any) => {
        if (val && typeof val === 'object' && 'value' in val) {
            return val.value;
        }
        return val;
    };

    const leftStats = [
        { label: 'STR', key: 'str' },
        { label: 'DEX', key: 'dex' },
        { label: 'CON', key: 'con' },
    ];
    const rightStats = [
        { label: 'INT', key: 'int' },
        { label: 'WIS', key: 'wis' },
        { label: 'CHA', key: 'cha' },
    ];

    // Calculate detailed slots
    const calculateSlots = () => {
        const items = actor.items || [];
        // Use the pre-calculated slotsUsed from the adapter if available
        return items.reduce((acc: number, item: any) => acc + (item.slotsUsed || 0), 0);
    };

    const usedSlots = calculateSlots();

    // Helper for gear status
    const getGearStatus = (item: any) => {
        let status = '';
        if (item.system?.equipped) status = '(Equipped)';
        else if (item.system?.stashed) status = '(Stashed)';
        else status = '(Carried)';

        // Append quantity if it's NOT a ration and (quantity > 1 or specific stackable)
        // Rations now have quantity handled in the name
        if (!isRation(item) && (item.system?.quantity > 1)) {
            return `${status} ${item.system.quantity}`;
        }
        return status;
    };

    const isLightSource = (item: any) => {
        const name = item.name?.toLowerCase() || "";
        return name.includes('torch') || name.includes('lantern') || name.includes('oil');
    };

    const isRation = (item: any) => {
        const name = item.name?.toLowerCase() || "";
        return name.includes('ration');
    };

    return (
        <div className="relative w-full h-full bg-black p-4 md:p-8 flex justify-center items-start font-serif text-sm overflow-y-auto">
            <style jsx global>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>
            {/* Sheet Container - Responsive */}
            <div className="bg-white text-black w-full max-w-[1200px] border-[3px] border-black shadow-2xl p-4 md:p-6 relative flex flex-col gap-4 mb-8">

                {/* Header Row */}
                <div className="flex flex-col md:grid md:grid-cols-12 gap-4 items-start mb-4">
                    <div className="w-full md:col-span-8 flex items-center justify-center pt-2">
                        {/* ShadowDark Logo Construction */}
                        <div className="flex flex-col items-center gap-2 w-full text-center">
                            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter uppercase leading-none break-words w-full">
                                ShadowDark
                            </h1>
                            <button
                                onClick={onToggleView}
                                className="print:hidden text-xs font-bold uppercase tracking-widest border-2 border-black px-3 py-1 hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] mx-auto"
                            >
                                Manage Character Sheet
                            </button>
                        </div>
                    </div>
                    <div className="w-full md:col-span-4 border-2 border-black p-2 pt-6 h-24 flex flex-col relative">
                        <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Name</div>
                        <input
                            key={actor.name}
                            type="text"
                            defaultValue={actor.name}
                            onBlur={(e) => onUpdate('name', e.target.value)}
                            className="w-full h-full text-2xl font-bold bg-transparent outline-none px-1"
                        />
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 items-start">

                    {/* --- COLUMN 1: Attributes & Combat --- */}
                    <div className="flex flex-col gap-4">

                        {/* Attributes Grid (2 cols) */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Left Column Stats */}
                            <div className="flex flex-col gap-2">
                                {leftStats.map(stat => (
                                    <div
                                        key={stat.key}
                                        onClick={() => triggerRollDialog('ability', stat.key)}
                                        className="border-2 border-black h-20 relative p-1 cursor-pointer hover:bg-neutral-100 transition-colors"
                                    >
                                        <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">{stat.label}</div>
                                        <div className="flex items-end justify-center h-full pb-1 gap-1">
                                            <span className="text-3xl font-bold">{actor.stats?.[stat.key]?.value || 10}</span>
                                            <span className="text-lg font-bold text-neutral-500 mb-1">
                                                ({((actor.stats?.[stat.key]?.mod || 0) >= 0 ? '+' : '') + (actor.stats?.[stat.key]?.mod || 0)})
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Right Column Stats */}
                            <div className="flex flex-col gap-2">
                                {rightStats.map(stat => (
                                    <div
                                        key={stat.key}
                                        onClick={() => triggerRollDialog('ability', stat.key)}
                                        className="border-2 border-black h-20 relative p-1 cursor-pointer hover:bg-neutral-100 transition-colors"
                                    >
                                        <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">{stat.label}</div>
                                        <div className="flex items-end justify-center h-full pb-1 gap-1">
                                            <span className="text-3xl font-bold">{actor.stats?.[stat.key]?.value || 10}</span>
                                            <span className="text-lg font-bold text-neutral-500 mb-1">
                                                ({((actor.stats?.[stat.key]?.mod || 0) >= 0 ? '+' : '') + (actor.stats?.[stat.key]?.mod || 0)})
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* HP / AC Row */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* HP Box */}
                            <div className="border-2 border-black h-24 relative flex flex-col">
                                <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit">HP</div>
                                <div className="flex-1 flex items-center justify-center text-2xl font-bold">
                                    <input
                                        key={actor.system?.attributes?.hp?.value}
                                        type="number"
                                        defaultValue={actor.system?.attributes?.hp?.value ?? 0}
                                        onBlur={(e) => onUpdate('system.attributes.hp.value', parseInt(e.target.value))}
                                        className="w-10 text-center bg-transparent outline-none border-b-2 border-black hover:bg-neutral-100 focus:bg-neutral-100 rounded"
                                    />
                                    <span className="text-neutral-400 mx-1 text-xl">/</span>
                                    {actor.computed?.maxHp || 0}
                                </div>
                            </div>
                            {/* AC Box */}
                            <div className="border-2 border-black h-24 relative flex flex-col">
                                <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit">AC</div>
                                <div className="flex-1 flex items-center justify-center text-3xl font-bold">
                                    {actor.computed?.ac || 10}
                                </div>
                            </div>
                        </div>

                        {/* Luck Box */}
                        <div
                            className="border-2 border-black h-16 relative flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 transition-colors"
                            onClick={() => onUpdate('system.luck.available', !actor.system?.luck?.available)}
                        >
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Luck</div>
                            <div className="flex items-center justify-center">
                                <div className={`w-10 h-10 border-2 border-black flex items-center justify-center transition-all ${actor.system?.luck?.available ? 'bg-black' : 'bg-transparent'}`}>
                                    {actor.system?.luck?.available && <Check className="text-white w-8 h-8 stroke-[4px]" />}
                                </div>
                            </div>
                        </div>

                        {/* Attacks Box */}
                        <div className="border-2 border-black flex flex-col">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit">Attacks</div>
                            <div className="p-2 space-y-2 flex-1">
                                {([
                                    ...(actor.derived?.attacks?.melee || []).map((a: any) => ({ ...a, _displayType: 'Melee' })),
                                    ...(actor.derived?.attacks?.ranged || []).map((a: any) => ({ ...a, _displayType: 'Ranged' }))
                                ]).slice(0, 5).map((atk: any, i: number) => (
                                    <div
                                        key={i}
                                        onClick={() => triggerRollDialog('item', atk._realId || atk.id || atk._id, { attackType: atk._displayType })}
                                        className="flex flex-col border-b border-black border-dotted pb-1 cursor-pointer hover:bg-neutral-100 transition-colors"
                                    >
                                        <div className="flex justify-between items-baseline">
                                            <span className="truncate text-xs font-bold uppercase flex-1">{atk.name}</span>
                                            <div className="flex gap-2 ml-1 text-xs font-bold">
                                                <span>{atk.derived?.toHit}</span>
                                                <span>{atk.derived?.damage}</span>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{atk._displayType} • {atk.derived?.handedness}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>


                    {/* --- COLUMN 2: Info --- */}
                    <div className="flex flex-col gap-4">
                        {/* Ancestry */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Ancestry</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <span className="text-lg font-bold w-full text-center truncate">
                                    {actor.computed?.resolvedNames?.ancestry || resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries') || ''}
                                </span>
                            </div>
                        </div>
                        {/* Class */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Class</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <span className="text-lg font-bold w-full text-center truncate">
                                    {actor.computed?.resolvedNames?.class || resolveEntityName(actor.system?.class, actor, systemData, 'classes') || ''}
                                </span>
                            </div>
                        </div>
                        {/* Level */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Level</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <span className="text-2xl font-bold w-full text-center">{actor.system?.level?.value || 0}</span>
                            </div>
                        </div>
                        {/* XP */}
                        <div className="border-2 border-black h-16 relative flex flex-col">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">XP</div>
                            <div className="flex-1 flex items-center justify-center text-xl font-bold pt-4">
                                <input
                                    key={actor.system?.level?.xp}
                                    type="number"
                                    defaultValue={actor.system?.level?.xp || 0}
                                    onBlur={(e) => onUpdate('system.level.xp', parseInt(e.target.value))}
                                    className="w-12 text-center bg-transparent outline-none border-b-2 border-black hover:bg-neutral-100 focus:bg-neutral-100 rounded"
                                />
                                <span className="text-neutral-400 mx-1">/</span>
                                <span>{Math.max(actor.system?.level?.value || 0, 1) * 10}</span>
                            </div>
                        </div>
                        {/* Title */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Title</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <div className="text-lg font-bold w-full text-center truncate px-1">
                                    {(() => {
                                        const clsName = resolveEntityName(actor.system?.class, actor, systemData, 'classes');
                                        const lvl = actor.system?.level?.value ?? 1;

                                        // Case-insensitive lookup for class titles
                                        let titleList = systemData?.titles?.[clsName];
                                        if (!titleList && clsName && systemData?.titles) {
                                            const key = Object.keys(systemData.titles).find(k => k.toLowerCase() === clsName.toLowerCase());
                                            if (key) titleList = systemData.titles[key];
                                        }

                                        const sysTitle = titleList?.find((t: any) => lvl >= t.from && lvl <= t.to);
                                        const alignment = (actor.system?.alignment || 'neutral').toLowerCase();
                                        return getDisplayValue(actor.system?.title) || sysTitle?.[alignment] || '';
                                    })()}
                                </div>
                            </div>
                        </div>
                        {/* Alignment */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Alignment</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <div className="text-lg font-bold w-full text-center truncate px-1 capitalize">
                                    {getDisplayValue(actor.system?.alignment) || ''}
                                </div>
                            </div>
                        </div>
                        {/* Background */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Background</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <div className="text-lg font-bold w-full text-center truncate px-1">
                                    {actor.computed?.resolvedNames?.background || resolveEntityName(actor.system?.background, actor, systemData, 'backgrounds') || ''}
                                </div>
                            </div>
                        </div>
                        {/* Deity */}
                        <div className="border-2 border-black h-16 p-1 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Deity</div>
                            <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                <div className="text-lg font-bold w-full text-center truncate px-1">
                                    {resolveEntityName(actor.system?.deity, actor, systemData, 'deities') || ''}
                                </div>
                            </div>
                        </div>

                        {/* Patron (Warlock Only) */}
                        {(() => {
                            const clsName = resolveEntityName(actor.system?.class, actor, systemData, 'classes');
                            if ((clsName || '').toLowerCase().includes('warlock')) {
                                return (
                                    <div className="border-2 border-black h-16 p-1 relative">
                                        <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Patron</div>
                                        <div className="flex items-end justify-center h-full w-full pb-1 px-1">
                                            <div className="text-lg font-bold w-full text-center truncate px-1">
                                                {resolveEntityName(actor.system?.patron, actor, systemData, 'patrons') || ''}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>


                    {/* --- COLUMN 3: Talents & Spells --- */}
                    <div className="flex flex-col gap-4">
                        {/* Spells Box (Conditional) */}
                        {(() => {
                            // Check if character is a spellcaster (has ability, class, or talent)
                            const hasAbility = !!actor.computed?.spellcastingAbility;
                            const className = resolveEntityName(actor.system?.class, actor, systemData, 'classes') || '';
                            const isKnownCaster = className.match(/wizard|priest|witch|druid|seer/i);
                            const hasCastingTalent = actor.items?.some((i: any) =>
                                (i.type === 'Talent' || i.type === 'Boon') &&
                                (i.name.toLowerCase().includes('spellcast') || i.name.toLowerCase().includes('learn spell'))
                            );

                            const isCaster = hasAbility || isKnownCaster || hasCastingTalent;

                            if (isCaster) {
                                return (
                                    <div className="border-2 border-black flex flex-col relative min-h-[4rem]">
                                        <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Spells</div>
                                        <div className="p-4 pt-8 space-y-1 overflow-auto">
                                            {(actor.items?.filter((i: any) => i.type === 'Spell') || [])
                                                .sort((a: any, b: any) => {
                                                    const tierA = Number(a.system?.tier ?? 0);
                                                    const tierB = Number(b.system?.tier ?? 0);
                                                    if (tierA !== tierB) return tierA - tierB;

                                                    const nameA = a.name || "";
                                                    const nameB = b.name || "";
                                                    return nameA.localeCompare(nameB);
                                                })
                                                .map((item: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        onClick={() => triggerRollDialog('item', item.id || item._id)}
                                                        className="flex justify-between items-baseline border-b border-black border-dotted pb-0.5 text-xs font-bold uppercase cursor-pointer hover:bg-neutral-100 hover:text-amber-700 transition-colors"
                                                    >
                                                        <span className="truncate">{item.name}</span>
                                                        {item.system?.tier !== undefined && <span className="text-[10px] text-neutral-500 ml-2">T{item.system.tier}</span>}
                                                    </div>
                                                ))}
                                            {(!actor.items?.some((i: any) => i.type === 'Spell')) && (
                                                <div className="text-[10px] text-neutral-400 italic text-center mt-2">No spells prepared</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Talents Box */}
                        <div className="border-2 border-black flex flex-col relative min-h-[8rem]">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Talents</div>
                            <div className="p-4 pt-8 space-y-1 overflow-auto">
                                {(actor.items?.filter((i: any) => i.type === 'Talent') || []).map((item: any, i: number) => (
                                    <div
                                        key={i}
                                        className="flex justify-between items-baseline border-b border-black border-dotted pb-0.5 text-xs font-bold uppercase"
                                    >
                                        <span className="truncate">{item.name}</span>
                                    </div>
                                ))}
                                {(!actor.items?.some((i: any) => i.type === 'Talent')) && (
                                    <div className="text-[10px] text-neutral-400 italic text-center mt-2">No talents recorded</div>
                                )}
                            </div>
                        </div>

                        {/* Languages Box */}
                        <div className="border-2 border-black flex flex-col relative min-h-[4rem]">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Languages</div>
                            <div className="p-4 pt-8 pb-2 overflow-auto">
                                {(() => {
                                    // 1. Gather languages from system
                                    const systemLangs = actor.system?.languages || [];

                                    // 2. Gather languages from items
                                    const itemLangs = (actor.items?.filter((i: any) => i.type === 'Language') || []).map((i: any) => i.name);

                                    // 3. Resolve names and deduplicate
                                    const allLangs = Array.from(new Set([
                                        ...systemLangs.map((l: any) => resolveEntityName(l, actor, systemData, 'languages')),
                                        ...itemLangs
                                    ])).filter(l => !!l && l !== '-').sort();

                                    if (allLangs.length === 0) {
                                        return <div className="text-[10px] text-neutral-400 italic text-center">No languages known</div>;
                                    }

                                    return (
                                        <div className="text-xs font-bold uppercase">
                                            {allLangs.join(', ')}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Notes Box */}
                        <div className="border-2 border-black flex flex-col relative flex-1 min-h-[8rem]">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Notes</div>
                            <div className="w-full h-full p-4 pt-8 font-serif text-sm bg-transparent whitespace-pre-wrap overflow-y-auto">
                                <div dangerouslySetInnerHTML={{ __html: getDisplayValue(actor.system?.details?.notes) || '' }} />
                            </div>
                        </div>
                    </div>


                    {/* --- COLUMN 4: Economy & Gear --- */}
                    <div className="flex flex-col gap-4">

                        {/* Slots Box */}
                        <div className="border-2 border-black h-16 relative flex flex-col items-center justify-center">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Slots</div>
                            <div className="text-2xl font-bold">
                                {actor.computed?.slotsUsed || 0} / {actor.computed?.maxSlots || 10}
                            </div>
                        </div>

                        {/* Gold Box */}
                        <div className="border-2 border-black p-2 relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Gold</div>
                            <div className="flex justify-around items-center pt-6 pb-2">
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold">GP</span>
                                    <input
                                        key={actor.system?.coins?.gp}
                                        type="number"
                                        defaultValue={actor.system?.coins?.gp || 0}
                                        onBlur={(e) => onUpdate('system.coins.gp', parseInt(e.target.value))}
                                        className="border-b-2 border-black w-14 text-center bg-transparent outline-none text-lg font-bold"
                                    />
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold">SP</span>
                                    <input
                                        key={actor.system?.coins?.sp}
                                        type="number"
                                        defaultValue={actor.system?.coins?.sp || 0}
                                        onBlur={(e) => onUpdate('system.coins.sp', parseInt(e.target.value))}
                                        className="border-b-2 border-black w-14 text-center bg-transparent outline-none text-lg font-bold"
                                    />
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold">CP</span>
                                    <input
                                        key={actor.system?.coins?.cp}
                                        type="number"
                                        defaultValue={actor.system?.coins?.cp || 0}
                                        onBlur={(e) => onUpdate('system.coins.cp', parseInt(e.target.value))}
                                        className="border-b-2 border-black w-14 text-center bg-transparent outline-none text-lg font-bold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Gear Box */}
                        <div className="border-2 border-black flex flex-col relative">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Gear</div>
                            <div className="p-4 pt-8 space-y-1 overflow-auto flex-1">
                                {actor.items?.filter((it: any) => ['Item', 'Armor', 'Weapon', 'Potion', 'Scroll', 'Wand', 'Gem', 'Basic'].includes(it.type)).map((item: any, i: number) => (
                                    <div
                                        key={i}
                                        className="flex flex-col border-b border-black border-dotted pb-1 cursor-pointer hover:bg-neutral-50 transition-colors group"
                                        onClick={() => setSelectedItem(item)}
                                    >
                                        <div className="flex gap-1 items-center overflow-hidden">
                                            <span className="w-5 text-xs font-bold">{i + 1}.</span>
                                            <div className="flex-1 flex justify-between items-center min-w-0">
                                                <span className="truncate text-xs font-bold uppercase group-hover:text-amber-700">
                                                    {isRation(item) ? `${item.name} X ${item.system?.quantity || 0}` : item.name}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0 text-neutral-400">
                                                    {/* Light Indicator */}
                                                    {item.system?.light?.active && (
                                                        <div className="flex items-center gap-0.5 text-orange-600 bg-orange-50 px-1 rounded border border-orange-200">
                                                            <Flame size={10} fill="currentColor" />
                                                            <span className="text-[9px] font-black">{item.lightSourceTimeRemaining || ''}</span>
                                                        </div>
                                                    )}
                                                    <Info size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pl-6 text-[9px] text-black font-bold uppercase leading-tight">
                                            {getGearStatus(item)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Free to Carry Box */}
                        <div className="border-2 border-black flex flex-col relative min-h-[4rem]">
                            <div className="bg-black text-white text-xs font-black uppercase px-2 py-0.5 w-fit absolute top-0 left-0">Free to Carry</div>
                            {/* Content for free to carry usually empty or specific items, simplified here */}
                            <div className="p-4 pt-8 space-y-1 font-serif text-sm">
                                {/* Ideally we filter for items marked 'free' or by rule, but here we leave empty for user notes or expansion */}
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            <ItemModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                item={selectedItem}
                onUpdate={onUpdate}
                actor={actor}
                systemData={systemData}
            />
        </div>
    );
}
