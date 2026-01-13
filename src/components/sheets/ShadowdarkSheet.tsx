'use client';

import { useState, useEffect } from 'react';
import ChatTab from '../ChatTab';
import RollDialog from '../RollDialog';
import { Crimson_Pro, Inter } from 'next/font/google';
import { SHADOWDARK_EQUIPMENT } from '@/lib/systems/shadowdark-data';

// Typography
const crimson = Crimson_Pro({ subsets: ['latin'], variable: '--font-crimson' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });


interface ShadowdarkSheetProps {
    actor: any;
    foundryUrl?: string;
    messages: any[];
    onRoll: (type: string, key: string, options?: any) => void;
    onChatSend: (msg: string) => void;
    onUpdate: (path: string, value: any) => void;
}

export default function ShadowdarkSheet({ actor, foundryUrl, messages, onRoll, onChatSend, onUpdate }: ShadowdarkSheetProps) {
    const [activeTab, setActiveTab] = useState('details');
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [systemData, setSystemData] = useState<any>(null);

    const [rollDialog, setRollDialog] = useState<{
        open: boolean;
        title: string;
        type: 'attack' | 'ability' | 'spell';
        defaults: any;
        callback: ((options: any) => void) | null;
    }>({
        open: false,
        title: '',
        type: 'attack',
        defaults: {},
        callback: null
    });

    const triggerRollDialog = (type: string, key: string, name?: string) => {
        let dialogType: 'attack' | 'ability' | 'spell' = 'attack';
        let title = '';
        let defaults: any = {};

        if (type === 'ability') {
            dialogType = 'ability';
            title = `${key.toUpperCase().replace('ABILITY', '')} Ability Check`; // e.g. "STR Ability Check"
            // Find mod
            const stat = actor.stats?.[key] || {};
            defaults.abilityBonus = stat.mod || 0;
        } else if (type === 'item') {
            // Find item
            const item = actor.items?.find((i: any) => i.id === key);
            if (item) {
                if (item.type === 'Spell') {
                    dialogType = 'spell';
                    title = `Cast Spell: ${item.name}`;
                    const statKey = item.system?.ability || 'int';
                    const stat = actor.stats?.[statKey] || {};
                    defaults.abilityBonus = stat.mod || 0;
                    defaults.talentBonus = 0; // TODO list
                } else {
                    dialogType = 'attack';
                    title = `Roll Attack with ${item.name}`;
                    // Attempt to pre-calculate bonuses
                    const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                    const isRanged = item.system?.type === 'ranged' || item.system?.range === 'near' || item.system?.range === 'far';

                    const str = actor.stats?.STR?.mod || 0;
                    const dex = actor.stats?.DEX?.mod || 0;

                    let statBonus = str;
                    if (isRanged) statBonus = dex;
                    else if (isFinesse) statBonus = Math.max(str, dex);

                    defaults.abilityBonus = statBonus;
                    defaults.itemBonus = item.system?.bonuses?.attackBonus || 0;
                }
            }
        }

        setRollDialog({
            open: true,
            title,
            type: dialogType,
            defaults,
            callback: (options) => {
                onRoll(type, key, options); // Pass options back up
            }
        });
    };

    useEffect(() => {
        fetch('/api/system/data')
            .then(res => res.json())
            .then(data => setSystemData(data))
            .catch(err => console.error('Failed to fetch system data:', err));
    }, []);

    const toggleItem = (id: string) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedItems(newSet);
    };

    // Helper to resolve image URLs
    const resolveImage = (path: string) => {
        if (!path) return '/placeholder.png';
        if (path.startsWith('http') || path.startsWith('data:')) return path;

        if (foundryUrl) {
            const cleanPath = path.startsWith('/') ? path.slice(1) : path;
            const cleanUrl = foundryUrl.endsWith('/') ? foundryUrl : `${foundryUrl}/`;
            return `${cleanUrl}${cleanPath}`;
        }
        return path;
    };

    // Slots Calculation Helper
    const calculateItemSlots = (item: any) => {
        const s = item.system?.slots;
        if (!s) return 0;

        // Handle simple number case
        if (typeof s !== 'object') {
            return Number(s) * (Number(item.system?.quantity) || 1);
        }

        const quantity = Number(item.system?.quantity) || 0;
        const perSlot = Number(s.per_slot) || 1;
        const slotsUsed = Number(s.slots_used) || 0;
        const freeCarry = Number(s.free_carry) || 0;

        const rawCost = Math.ceil(quantity / perSlot) * slotsUsed;
        return Math.max(0, rawCost - freeCarry);
    };

    // Calculate Max Slots based on STR and Talents (Hauler)
    const calculateMaxSlots = () => {
        // 1. Base slots = Max(10, STR Score)
        // Check both 'str' and 'STR' just in case, and check .value (score) vs .mod
        const strObj = actor.stats?.str || actor.stats?.STR || actor.attributes?.str || actor.attributes?.STR;
        const strScore = Number(strObj?.value) || 10;
        const base = Math.max(10, strScore);

        // 2. Hauler Talent: Add CON mod slots
        const hauler = actor.items?.find((i: any) => i.type === 'Talent' && i.name.toLowerCase() === 'hauler');
        let bonus = 0;
        if (hauler) {
            const conObj = actor.stats?.con || actor.stats?.CON || actor.attributes?.con || actor.attributes?.CON;
            bonus = Number(conObj?.mod) || 0;
        }

        return base + bonus;
    };


    // Safe extractor for description text to handle various Foundry data shapes
    const getSafeDescription = (system: any) => {
        if (!system) return '';
        // 1. Try explicit .value property (common for rich text objects)
        if (system.description?.value) return system.description.value;
        // 2. Try description as a direct string
        else if (typeof system.description === 'string' && system.description.trim()) return system.description;
        // 3. Try legacy .desc property
        else if (system.desc) return system.desc;
        return '';
    };

    // Helper to parse description for inline rolls and UUIDs
    // Helper to parse description for inline rolls and UUIDs
    const formatDescription = (desc: any) => {
        // Note: getSafeDescription usually ensures this is a string, but we double check.
        if (!desc || typeof desc !== 'string') return '';

        let fixed = desc;

        // 1. UUID Links: @UUID[...]{Label} -> Label
        fixed = fixed.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');

        // 2. Inline Rolls: [[/r 1d8]] or [[/roll 1d8]]
        fixed = fixed.replace(/\[\[(.*?)\]\]/g, (match, content) => {
            let cleanContent = content.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]*>/g, '');
            const lower = cleanContent.toLowerCase().trim();

            const checkMatch = lower.match(/^check\s+(\d+)\s+(\w+)$/);
            if (checkMatch) {
                return `<button data-action="roll-check" data-dc="${checkMatch[1]}" data-stat="${checkMatch[2]}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer">check ${checkMatch[2].toUpperCase()} (DC ${checkMatch[1]})</button>`;
            }

            // Only match /r or /roll
            if (lower.startsWith('/r') || lower.startsWith('/roll')) {
                const formula = cleanContent.replace(/^\/(r|roll)\s*/i, '').trim();
                return `<button type="button" data-action="roll-formula" data-formula="${formula}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer"><span class="font-serif italic">roll</span> ${formula}</button>`;
            }

            return match;
        });

        return fixed;
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

    const tabs = ['details', 'abilities', 'spells', 'inventory', 'talents', 'notes', 'effects', 'chat'];

    // Common container style for standard sheet feel
    const cardStyle = "bg-white border-2 border-black p-4 text-black shadow-sm relative";
    const cardStyleWithoutPadding = "bg-white border-2 border-black text-black shadow-sm relative";
    const labelStyle = "text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1 block font-sans";
    const valueStyle = "font-serif text-lg leading-none";

    return (
        <div className={`flex flex-col h-full relative pb-32 ${crimson.variable} ${inter.variable} font-sans bg-neutral-100 text-black`}>
            {/* Header / Top Nav */}
            <div className="bg-neutral-900 text-white shadow-md sticky top-0 z-10 flex items-stretch justify-between mb-6 border-b-4 border-black h-24">
                <div className="flex items-center gap-6">
                    <img
                        src={resolveImage(actor.img)}
                        alt={actor.name}
                        className="h-full w-24 object-cover border-r-2 border-white/10 bg-neutral-800"
                    />
                    <div className="py-2">
                        <h1 className="text-3xl font-serif font-bold leading-none tracking-tight">{actor.name}</h1>
                        <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                            {actor.details?.ancestry} {actor.details?.class} {actor.level?.value ? `Level ${actor.level.value}` : ''}
                        </p>
                    </div>
                </div>
                {/* Stats Summary */}
                <div className="flex gap-6 items-center pr-6">
                    {actor.hp && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">HP</span>
                            <div className="flex items-center gap-1 font-serif font-bold text-2xl">
                                <input
                                    type="number"
                                    defaultValue={actor.hp.value}
                                    onBlur={(e) => {
                                        let val = parseInt(e.target.value);
                                        // Enforce Max HP Cap
                                        if (val > actor.hp.max) val = actor.hp.max;
                                        // Reset input display if it was capped
                                        if (val !== parseInt(e.target.value)) e.target.value = val.toString();

                                        if (val !== actor.hp.value) onUpdate('system.attributes.hp.value', val);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    className="w-12 text-center bg-transparent border-b border-neutral-300 hover:border-black focus:border-amber-500 outline-none transition-colors"
                                />
                                <span className="opacity-50">/</span>
                                <span>{actor.hp.max}</span>
                            </div>
                        </div>
                    )}
                    {actor.ac !== undefined && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">AC</span>
                            <span className="font-serif font-bold text-2xl">{actor.ac}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b-2 border-black bg-white overflow-x-auto mb-6 mx-4">
                {tabs.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`min-w-[80px] flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-4 border-r border-black last:border-r-0 ${activeTab === tab ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-200'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 px-4 max-w-5xl mx-auto w-full">

                {activeTab === 'details' && (
                    <div className="flex flex-col gap-6 h-full overflow-hidden">
                        <div className="flex flex-col gap-6 overflow-y-auto pb-20">

                            {/* Top Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                                {/* Level */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Level</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 text-center font-serif text-xl font-bold bg-[#efece6]">
                                        {actor.level?.value || 1}
                                    </div>
                                </div>

                                {/* Title */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Title</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6]">
                                        {(() => {
                                            const clsVal = actor.details?.class;
                                            const clsObj = systemData?.classes?.find((c: any) => c.uuid === clsVal || c.name === clsVal);
                                            const clsName = clsObj ? clsObj.name : clsVal;
                                            const lvl = actor.level?.value || 1;
                                            const sysTitle = systemData?.titles?.[clsName]?.find((t: any) => lvl >= t.from && lvl <= t.to);
                                            const alignment = (actor.details?.alignment || 'neutral').toLowerCase();
                                            return actor.details?.title || sysTitle?.[alignment] || '-';
                                        })()}
                                    </div>
                                </div>

                                {/* Class */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Class</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6] flex items-center gap-2">
                                        <i className="fas fa-book text-neutral-400"></i>
                                        {actor.details?.class || 'Unknown'}
                                    </div>
                                </div>

                                {/* XP */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">XP</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 flex items-center justify-center gap-2 font-serif text-lg bg-[#efece6]">
                                        <input
                                            type="number"
                                            defaultValue={actor.level?.xp || 0}
                                            onBlur={(e) => {
                                                const val = parseInt(e.target.value);
                                                if (!isNaN(val) && val !== actor.level?.xp) onUpdate('system.level.xp', val);
                                            }}
                                            className="w-12 bg-neutral-200/50 border-b border-black text-center outline-none rounded px-1"
                                        />
                                        <span className="text-neutral-400">/</span>
                                        <span>{actor.level?.next || 10}</span>
                                    </div>
                                </div>

                                {/* Ancestry */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Ancestry</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6]">
                                        {actor.details?.ancestry || 'Unknown'}
                                    </div>
                                </div>

                                {/* Background */}
                                <div className={cardStyleWithoutPadding}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Background</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6]">
                                        {actor.details?.background || 'Unknown'}
                                    </div>
                                </div>

                                {/* Alignment */}
                                <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1.5`}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Alignment</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6]">
                                        <select
                                            className="w-full bg-transparent outline-none cursor-pointer"
                                            defaultValue={actor.details?.alignment || 'neutral'}
                                            onChange={(e) => onUpdate('system.details.alignment', e.target.value)}
                                        >
                                            <option value="lawful">Lawful</option>
                                            <option value="neutral">Neutral</option>
                                            <option value="chaotic">Chaotic</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Deity */}
                                <div className={`${cardStyleWithoutPadding} md:col-span-2 lg:col-span-1.5`}>
                                    <div className="bg-black text-white p-1 px-2 border-b border-black flex justify-between items-center">
                                        <span className="font-serif font-bold text-sm uppercase">Deity</span>
                                        <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                                    </div>
                                    <div className="p-2 font-serif text-lg bg-[#efece6]">
                                        {actor.details?.deity || '-'}
                                    </div>
                                </div>
                            </div>


                            {/* Languages */}
                            <div className={cardStyle}>
                                <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                                    <span className="font-serif font-bold text-lg uppercase">Languages</span>
                                </div>
                                <div className="p-1 flex flex-wrap gap-2">
                                    {(() => {
                                        const actorLangsRaw = actor.details?.languages || [];
                                        const resolvedLangs = actorLangsRaw.map((l: any) => {
                                            const isObj = typeof l === 'object';
                                            const val = isObj ? l.name : l;
                                            const match = systemData?.languages?.find((sl: any) => sl.uuid === val || sl.name === val);
                                            return {
                                                raw: val,
                                                name: match ? match.name : val,
                                                desc: match ? match.description : (isObj ? l.description : 'Description unavailable.'),
                                                rarity: match ? match.rarity : 'common',
                                                uuid: match ? match.uuid : null
                                            };
                                        });

                                        let classConfig: any = { fixed: [], common: 0, rare: 0, languages: [] };
                                        const rawClassLangs = actor.details?.classLanguages;
                                        let targetClassData = rawClassLangs;
                                        if (!targetClassData && actor.details?.class && systemData?.classes) {
                                            const classDoc = systemData.classes.find((c: any) => c.name === actor.details.class);
                                            if (classDoc) targetClassData = classDoc.languages;
                                        }

                                        if (Array.isArray(targetClassData)) {
                                            classConfig.fixed = targetClassData;
                                        } else if (typeof targetClassData === 'object' && targetClassData !== null) {
                                            classConfig.fixed = targetClassData.fixed || [];
                                            classConfig.common = targetClassData.common || 0;
                                            classConfig.rare = targetClassData.rare || 0;
                                        }

                                        const actorCounts = resolvedLangs.reduce((acc: any, l: any) => {
                                            acc[l.rarity] = (acc[l.rarity] || 0) + 1;
                                            return acc;
                                        }, {});

                                        return resolvedLangs.map((lang: any, i: number) => {
                                            let isClass = classConfig.fixed.includes(lang.name) ||
                                                classConfig.fixed.includes(lang.raw) ||
                                                (lang.uuid && classConfig.fixed.includes(lang.uuid));

                                            if (!isClass) {
                                                if (lang.rarity === 'common' && classConfig.common > 0) {
                                                    if (actorCounts['common'] <= classConfig.common) isClass = true;
                                                } else if (lang.rarity === 'rare' && classConfig.rare > 0) {
                                                    if (actorCounts['rare'] <= classConfig.rare) isClass = true;
                                                }
                                            }

                                            let tooltip = lang.desc && lang.desc !== '<p></p>' ? lang.desc.replace(/<[^>]*>?/gm, '') : 'No description.';
                                            if (lang.rarity) tooltip += ` (${lang.rarity})`;

                                            return (
                                                <span
                                                    key={i}
                                                    title={tooltip}
                                                    className={`cursor-help font-serif text-sm font-medium px-2 py-0.5 text-white shadow-sm ${isClass ? 'bg-black' : 'bg-[#7c4f8d]'}`}
                                                >
                                                    {lang.name}
                                                </span>
                                            );
                                        });
                                    })()}
                                    {(!actor.details?.languages || actor.details.languages.length === 0) && <span className="text-neutral-500 text-sm italic">None known</span>}
                                </div>
                            </div>

                            {/* Boons */}
                            <div className={cardStyle}>
                                <div className="bg-black text-white p-2 mb-2 -mx-4 -mt-4 border-b-2 border-black flex justify-between items-center">
                                    <span className="font-bold font-serif uppercase tracking-widest text-sm">Boons</span>
                                </div>
                                <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1 mb-2">
                                    <div className="col-span-6">Boon Name</div>
                                    <div className="col-span-3">Type</div>
                                    <div className="col-span-3 text-center">Level</div>
                                </div>
                                <div className="divide-y divide-neutral-200">
                                    {actor.items?.filter((i: any) => i.type === 'Boon').map((item: any) => (
                                        <div key={item.id} className="grid grid-cols-12 py-2 px-2 text-sm font-serif items-center">
                                            <div className="col-span-6 font-bold flex items-center">
                                                <img
                                                    src={resolveImage(item.img)}
                                                    alt={item.name}
                                                    className="w-6 h-6 object-cover border border-black mr-2 bg-neutral-200"
                                                />
                                                {item.name}
                                            </div>
                                            <div className="col-span-3 text-neutral-600 capitalize">{item.system?.boonType || item.system?.type || '-'}</div>
                                            <div className="col-span-3 text-center">{item.system?.level?.value || item.system?.level || '-'}</div>
                                        </div>
                                    ))}
                                    {(!actor.items?.some((i: any) => i.type === 'Boon')) && (
                                        <div className="text-center text-neutral-400 italic py-4 text-xs">No boons recorded.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'abilities' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">

                        {/* LEFT COLUMN: Vitals, Stats */}
                        <div className="md:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-20">

                            {/* HP Box */}
                            {actor.hp && (
                                <div className={cardStyle}>
                                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 flex justify-between items-center px-2 border-b border-white">
                                        <span className="font-serif font-bold text-lg">HP</span>
                                        <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                                    </div>
                                    <div className="flex justify-center items-baseline gap-2 font-serif text-3xl font-bold pt-2">
                                        <input
                                            type="number"
                                            defaultValue={actor.hp.value}
                                            onBlur={(e) => {
                                                let val = parseInt(e.target.value);
                                                if (val > actor.hp.max) val = actor.hp.max;
                                                if (val !== parseInt(e.target.value)) e.target.value = val.toString();
                                                if (val !== actor.hp.value) onUpdate('system.attributes.hp.value', val);
                                            }}
                                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                            className="w-16 text-center bg-neutral-100 rounded border-b-2 border-neutral-300 focus:border-black outline-none"
                                        />
                                        <span className="text-neutral-400 text-xl font-sans font-light">/</span>
                                        <span>{actor.hp.max}</span>
                                    </div>
                                </div>
                            )}

                            {/* AC & Luck Row */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* AC */}
                                <div className={cardStyle}>
                                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                                        <span className="font-serif font-bold text-lg">AC</span>
                                        <img src="/icons/shield.svg" className="w-4 h-4 invert opacity-50" alt="" />
                                    </div>
                                    <div className="text-center font-serif text-3xl font-bold py-2">
                                        {actor.ac || 10}
                                    </div>
                                </div>
                                {/* Luck */}
                                <div className={cardStyle}>
                                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                                        <span className="font-serif font-bold text-lg">LUCK</span>
                                    </div>
                                    <div className="flex justify-center py-2 h-full items-center">
                                        <button
                                            onClick={() => onUpdate('system.luck.available', !actor.luck?.available)}
                                            className={`w-8 h-8 rounded border-2 border-black shadow-sm flex items-center justify-center transition-all ${actor.luck?.available ? 'bg-black' : 'bg-white'}`}
                                        >
                                            {actor.luck?.available && <span className="text-white text-xs">●</span>}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className={cardStyle}>
                                <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                                    <span className="font-serif font-bold text-lg">STATS</span>
                                    <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    {(() => { console.log('DEBUG STATS:', actor.stats); return null; })()}
                                    {Object.entries(actor.stats || {}).map(([key, stat]: [string, any]) => (
                                        <div key={key}
                                            className="flex flex-col items-center bg-neutral-100 border-2 border-neutral-300 rounded cursor-pointer transition-all hover:border-black hover:bg-white hover:scale-105 active:scale-95 group overflow-hidden"
                                            onClick={() => triggerRollDialog('ability', key)}>
                                            <div className="w-full bg-neutral-200 text-center py-1 border-b border-neutral-300 group-hover:bg-neutral-800 transition-colors">
                                                <span className="font-bold text-xs uppercase tracking-widest text-neutral-600 group-hover:text-white transition-colors">{key}</span>
                                            </div>
                                            <div className="flex flex-col items-center py-2">
                                                <span className="font-serif text-2xl font-bold leading-none mb-1 text-black">{stat.base}</span>
                                                <span className="text-neutral-500 text-xs font-serif font-bold">
                                                    ({stat.mod >= 0 ? '+' : ''}{stat.mod})
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        {/* RIGHT COLUMN: Combat & Attacks */}
                        <div className="md:col-span-2 flex flex-col gap-4 overflow-y-auto pb-20">

                            {/* Melee Attacks */}
                            <div className={cardStyle}>
                                <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                                    <span className="font-serif font-bold text-lg uppercase">Melee Attacks</span>
                                </div>
                                <div className="space-y-2">
                                    {actor.items?.filter((i: any) => i.type === 'Weapon' && i.system?.type === 'melee').map((item: any) => {
                                        const isFinesse = item.system?.properties?.some((p: any) => p.includes('finesse') || p.includes('Finesse'));
                                        const strMod = actor.stats?.STR?.mod || 0;
                                        const dexMod = actor.stats?.DEX?.mod || 0;
                                        const bonus = (isFinesse ? Math.max(strMod, dexMod) : strMod) + (item.system?.bonuses?.attackBonus || 0);
                                        const signedBonus = bonus >= 0 ? `+${bonus}` : bonus;

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => triggerRollDialog('item', item.id)}
                                                className="bg-neutral-50 p-2 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors cursor-pointer group"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold font-serif text-lg leading-none">{item.name}</span>
                                                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
                                                            {item.system?.damage?.twoHanded ? '(2H)' : '(1H)'}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-neutral-700 font-sans mt-1">
                                                        <span className="font-bold">{signedBonus}</span> to hit, <span className="font-bold">{item.system?.damage?.numDice || 1}{item.system?.damage?.oneHanded || 'd4'}</span> dmg
                                                        {item.system?.properties?.length > 0 && <span className="text-neutral-400 text-xs ml-2 italic">({item.system.properties.length} props)</span>}
                                                    </div>
                                                </div>
                                                <button
                                                    className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition-all"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                                                        <path d="M12 2L2 22h20L12 2zm0 3.5 6 12H6l6-12z" />
                                                        <text x="12" y="19" fontSize="8" fontWeight="bold" textAnchor="middle" fill="black">20</text>
                                                    </svg>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {!actor.items?.some((i: any) => i.type === 'Weapon' && i.system?.type === 'melee') && (
                                        <div className="text-neutral-400 text-sm italic text-center py-2">No melee weapons equipped.</div>
                                    )}
                                </div>
                            </div>

                            {/* Ranged Attacks */}
                            <div className={cardStyle}>
                                <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                                    <span className="font-serif font-bold text-lg uppercase">Ranged Attacks</span>
                                </div>
                                <div className="space-y-2">
                                    {actor.items?.filter((i: any) => i.type === 'Weapon' && (i.system?.type === 'ranged' || i.system?.range === 'near' || i.system?.range === 'far')).map((item: any) => {
                                        const dexMod = actor.stats?.DEX?.mod || 0;
                                        const bonus = dexMod + (item.system?.bonuses?.attackBonus || 0);
                                        const signedBonus = bonus >= 0 ? `+${bonus}` : bonus;

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => triggerRollDialog('item', item.id)}
                                                className="bg-neutral-50 p-2 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors cursor-pointer group"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold font-serif text-lg leading-none">{item.name}</span>
                                                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
                                                            ({item.system?.range})
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-neutral-700 font-sans mt-1">
                                                        <span className="font-bold">{signedBonus}</span> to hit, <span className="font-bold">{item.system?.damage?.numDice || 1}{item.system?.damage?.oneHanded || 'd4'}</span> dmg
                                                    </div>
                                                </div>
                                                <button
                                                    className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition-all"
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                                                        <path d="M12 2L2 22h20L12 2zm0 3.5 6 12H6l6-12z" />
                                                        <text x="12" y="19" fontSize="8" fontWeight="bold" textAnchor="middle" fill="black">20</text>
                                                    </svg>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {!actor.items?.some((i: any) => i.type === 'Weapon' && (i.system?.type === 'ranged' || i.system?.range === 'near' || i.system?.range === 'far')) && (
                                        <div className="text-neutral-400 text-sm italic text-center py-2">No ranged weapons equipped.</div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* Spells Tab */}
                {activeTab === 'spells' && (
                    <div className="space-y-8 pb-20">
                        {/* Spells Known */}
                        <div className="space-y-6">
                            <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                                <span>Spells Known</span>
                                <i className="fas fa-book-open text-white/50"></i>
                            </div>

                            {[1, 2, 3, 4, 5].map(tier => {
                                const spells = actor.items?.filter((i: any) => i.type === 'Spell' && i.system?.tier === tier) || [];
                                if (spells.length === 0) return null;
                                return (
                                    <div key={tier} className="">
                                        <div className="border-b-2 border-black mb-2 flex items-end justify-between px-2 pb-1">
                                            <span className="font-serif font-bold text-lg">Tier {tier}</span>
                                            <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-neutral-500 w-[300px] justify-between pr-2">
                                                <span className="w-32 text-center">Duration</span>
                                                <span className="w-20 text-center">Range</span>
                                                <span className="w-16 text-center"></span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            {spells.map((spell: any) => {
                                                const isExpanded = expandedItems.has(spell.id);
                                                return (
                                                    <div key={spell.id} className="bg-white border-black border-2 p-1 shadow-sm group">
                                                        {/* Header */}
                                                        <div
                                                            className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1 transition-colors"
                                                            onClick={() => toggleItem(spell.id)}
                                                        >
                                                            {/* Spell Image / Fallback */}
                                                            <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                                                {spell.img ? (
                                                                    <img src={resolveImage(spell.img)} alt={spell.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="text-white font-serif font-bold text-lg">{spell.name.charAt(0)}</span>
                                                                )}
                                                            </div>

                                                            {/* Name & Info */}
                                                            <div className="flex-1 flex flex-col justify-center overflow-hidden">
                                                                <div className={`font-serif font-bold text-lg uppercase leading-none truncate ${spell.system?.lost ? 'line-through text-neutral-400' : 'text-black'}`}>
                                                                    {spell.name}
                                                                </div>
                                                                <div className="flex gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                                                                    {spell.system?.class && <span>{spell.system.class}</span>}
                                                                </div>
                                                            </div>

                                                            {/* Metadata Columns (Duration/Range) */}
                                                            <div className="flex items-center gap-4 w-[300px] justify-between">
                                                                <span className="text-sm font-serif w-32 text-center truncate">
                                                                    {(() => {
                                                                        const val = spell.system?.duration?.value;
                                                                        const type = spell.system?.duration?.type || '-';
                                                                        const capType = type.charAt(0).toUpperCase() + type.slice(1);

                                                                        // User logic: "If simple (empty/-1) blank value, else verbatim"
                                                                        // Check for "empty" (null/undefined/empty-string) or -1 or "-1"
                                                                        if (val === undefined || val === null || val === '' || val === -1 || val === '-1') {
                                                                            return capType;
                                                                        }

                                                                        // Verbatim: show value + type
                                                                        // We optionally singularize ONLY if strictly "1" or 1
                                                                        if ((val === 1 || val === '1') && capType.endsWith('s')) {
                                                                            return `${val} ${capType.slice(0, -1)}`;
                                                                        }

                                                                        return `${val} ${capType}`;
                                                                    })()}
                                                                </span>
                                                                <span className="text-sm font-serif w-20 text-center truncate">{spell.system?.range || 'Close'}</span>

                                                                {/* Actions */}
                                                                <div className="flex gap-2 pl-2 items-center justify-end w-16">
                                                                    {/* Cast Button */}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (!spell.system?.lost) {
                                                                                triggerRollDialog('item', spell.id, spell.name);
                                                                            }
                                                                        }}
                                                                        disabled={spell.system?.lost}
                                                                        className={`w-7 h-7 flex items-center justify-center rounded-full transition-all shadow-sm ${spell.system?.lost ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed opacity-50' : 'bg-black text-white hover:bg-neutral-800 hover:scale-110'}`}
                                                                        title={spell.system?.lost ? "Spell Lost" : "Cast Spell"}
                                                                    >
                                                                        {/* D20 Icon SVG */}
                                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                                                            <path fillRule="evenodd" d="M12.9 2.2c-.4-.5-1.4-.5-1.8 0L2.8 12.8c-.4.5-.2 1.2.5 1.2h17.4c.7 0 .9-.7.5-1.2L12.9 2.2zM3.4 15c-.6 0-.9.7-.5 1.2l7.3 8c.4.4 1 .4 1.4 0l7.3-8c.4-.5.1-1.2-.5-1.2H3.4z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>

                                                                    {/* Lost Toggle */}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            onUpdate(`items.${spell.id}.system.lost`, !spell.system?.lost);
                                                                        }}
                                                                        className={`w-7 h-7 flex items-center justify-center rounded-full border transition-all hover:scale-110 shadow-sm ${spell.system?.lost ? 'bg-red-100 border-red-500 text-red-600' : 'bg-white border-neutral-300 text-neutral-300 hover:border-black hover:text-black'}`}
                                                                        title={spell.system?.lost ? "Restore Spell" : "Mark as Lost"}
                                                                    >
                                                                        {/* Hand/Stop Icon or Check */}
                                                                        {spell.system?.lost ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Expanded Content */}
                                                        {isExpanded && (
                                                            <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                                                <div className="mt-2 text-sm font-serif leading-relaxed text-neutral-800">
                                                                    <div
                                                                        dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(spell.system)) || '<span class="italic text-neutral-400">No description available.</span>' }}
                                                                        onClick={handleDescriptionClick}
                                                                    />
                                                                </div>
                                                                <div className="mt-3 flex gap-2 flex-wrap">
                                                                    <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">Tier {spell.system?.tier}</span>
                                                                    {spell.system?.duration?.type && (
                                                                        <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">
                                                                            Duration: {(() => {
                                                                                const val = spell.system?.duration?.value;
                                                                                const type = spell.system?.duration?.type || '-';
                                                                                const capType = type.charAt(0).toUpperCase() + type.slice(1);

                                                                                if (val === undefined || val === null || val === '' || val === -1 || val === '-1') {
                                                                                    return capType;
                                                                                }
                                                                                // Singularize if 1
                                                                                if ((val === 1 || val === '1') && capType.endsWith('s')) {
                                                                                    return `${val} ${capType.slice(0, -1)}`;
                                                                                }
                                                                                return `${val} ${capType}`;
                                                                            })()}
                                                                        </span>
                                                                    )}
                                                                    <span className="bg-neutral-100 text-neutral-600 border border-neutral-200 text-[10px] px-2 py-1 uppercase tracking-widest font-bold rounded">Range: {spell.system?.range}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {(actor.items?.filter((i: any) => i.type === 'Spell').length === 0) && (
                                <div className="text-center text-neutral-400 italic py-12 border-2 border-dashed border-neutral-200 rounded-lg">No spells known.</div>
                            )}
                        </div>

                        {/* Spells From Items */}
                        <div className="space-y-4 pt-4">
                            <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                                <span>Spells From Items</span>
                                <span className="text-xs font-normal opacity-70 tracking-normal">(Scrolls & Wands)</span>
                            </div>
                            <div className="space-y-2">
                                {actor.items?.filter((i: any) => ['Scroll', 'Wand'].includes(i.type)).map((item: any) => {
                                    const isExpanded = expandedItems.has(item.id);
                                    return (
                                        <div key={item.id} className="bg-white border-black border-2 p-1 shadow-sm group">
                                            {/* Header */}
                                            <div
                                                className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1 transition-colors"
                                                onClick={() => toggleItem(item.id)}
                                            >
                                                <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                                    <img src={resolveImage(item.img)} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-serif font-bold text-lg leading-none">{item.name}</div>
                                                    <div className="text-xs text-neutral-500 uppercase tracking-widest font-bold mt-1">{item.type}</div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        triggerRollDialog('item', item.id);
                                                    }}
                                                    className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center transition-all hover:scale-110 shadow-sm"
                                                    title="Use Item"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                        <path fillRule="evenodd" d="M12.9 2.2c-.4-.5-1.4-.5-1.8 0L2.8 12.8c-.4.5-.2 1.2.5 1.2h17.4c.7 0 .9-.7.5-1.2L12.9 2.2zM3.4 15c-.6 0-.9.7-.5 1.2l7.3 8c.4.4 1 .4 1.4 0l7.3-8c.4-.5.1-1.2-.5-1.2H3.4z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                                    <div className="mt-2 text-sm font-serif leading-relaxed text-neutral-800">
                                                        <div
                                                            className="prose prose-sm max-w-none"
                                                            dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(item.system)) || '<span class="italic text-neutral-400">No description available.</span>' }}
                                                            onClick={handleDescriptionClick}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {(actor.items?.filter((i: any) => ['Scroll', 'Wand'].includes(i.type)).length === 0) && (
                                <div className="text-center text-neutral-400 italic py-8 border-2 border-dashed border-neutral-200 rounded-lg">No magical items (Scrolls/Wands) found.</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'talents' && (
                    <div className="space-y-4">
                        {/* Using a more list-like approach for talents to mimic the sheet */}
                        {actor.items?.filter((i: any) => i.type === 'Talent' || i.type === 'Feature').map((item: any) => (
                            <div key={item.id} className="bg-white border-black border-2 p-1 flex gap-2 shadow-sm">
                                <div className="bg-black text-white p-2 min-w-[40px] flex items-center justify-center font-bold text-lg font-serif">
                                    {item.name.charAt(0)}
                                </div>
                                <div className="p-2 flex-1">
                                    <div className="font-bold font-serif text-lg uppercase mb-1">{item.name}</div>
                                    <div
                                        className="text-sm text-neutral-700 leading-relaxed font-serif"
                                        dangerouslySetInnerHTML={{ __html: formatDescription(item.system?.description?.value) || '' }}
                                        onClick={handleDescriptionClick}
                                    ></div>
                                </div>
                            </div>
                        ))}
                        {(!actor.items?.some((i: any) => i.type === 'Talent' || i.type === 'Feature')) && (
                            <div className="col-span-full text-center text-neutral-500 italic p-10 font-serif">No talents recorded.</div>
                        )}
                    </div>
                )}

                {activeTab === 'chat' && (
                    <div className="h-[800px] overflow-hidden p-2">
                        <ChatTab
                            messages={messages}
                            onSend={onChatSend}
                            foundryUrl={foundryUrl}
                            onRoll={onRoll}
                            variant="shadowdark"
                        />
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Inventory: Equipped, Carried, Stashed (Col 1 & 2) */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Helper for rendering an item row to ensure consistency */}
                            {(() => {
                                const renderItemRow = (item: any) => {
                                    const rawSlots = item.system?.slots;
                                    const slots = typeof rawSlots === 'object' ? (rawSlots.slots_used || 0) : (Number(rawSlots) || 0);
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
                                    const rawDesc = item.system?.description?.value || item.system?.desc || item.system?.description || '';
                                    // Fallback to static data if missing
                                    const description = rawDesc || SHADOWDARK_EQUIPMENT[item.name] || '';

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
                                                    const action = rollBtn.getAttribute('data-action');
                                                    if (action === 'roll-check') {
                                                        const stat = rollBtn.getAttribute('data-stat');
                                                        if (stat) onRoll('ability', stat);
                                                    } else if (action === 'roll-formula') {
                                                        const formula = rollBtn.getAttribute('data-formula');
                                                        // We can reuse the chat send logic for raw rolls since onRoll is for formatted system rolls
                                                        // But creating a 'raw' type for onRoll or just sending a message is easiest.
                                                        // Let's send a chat message command for now as that's robust
                                                        if (formula) onChatSend(`/r ${formula}`);
                                                    }
                                                    return;
                                                }

                                                toggleItem(item.id);
                                            }}
                                        >
                                            <div className="grid grid-cols-12 p-2 gap-2 items-center font-serif text-sm">
                                                <div className="col-span-6 font-bold flex items-center">
                                                    {/* Thumbnail */}
                                                    <img
                                                        src={resolveImage(item.img)}
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
                                                        <div dangerouslySetInnerHTML={{ __html: formatDescription(description) }} className="font-serif leading-relaxed" />
                                                    ) : (
                                                        <div className="italic text-neutral-400">
                                                            No description available.
                                                            {/* Debug Helper for User */}
                                                            <br />
                                                            <details className="mt-1">
                                                                <summary className="cursor-pointer text-[10px] font-mono text-neutral-500 hover:underline">Debug Spec</summary>
                                                                <pre className="text-[9px] bg-neutral-100 p-1 overflow-auto mt-1">
                                                                    DESC: {JSON.stringify(item.system?.description)}
                                                                    {'\n'}
                                                                    PROPS: {JSON.stringify(item.system?.properties)}
                                                                    {'\n'}
                                                                    AC: {JSON.stringify(item.system?.ac)}
                                                                </pre>
                                                            </details>
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
                                    <>
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
                                    </>
                                );
                            })()}
                        </div>

                        {/* Sidebar with Updated Totals */}
                        <div className="lg:col-start-3 row-start-1 lg:row-start-auto flex flex-col gap-6">

                            {/* Slots Panel */}
                            <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">Slots</h3>
                                <div className="flex justify-between items-baseline mb-3">
                                    <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Total</span>
                                    <span className={`text-3xl font-serif font-black ${(actor.items?.filter((i: any) => !i.system?.stashed).reduce((acc: number, i: any) => acc + calculateItemSlots(i), 0) > calculateMaxSlots()) ? 'text-red-600' : ''}`}>
                                        {actor.items?.filter((i: any) => !i.system?.stashed).reduce((acc: number, i: any) => {
                                            return acc + calculateItemSlots(i);
                                        }, 0)} / {calculateMaxSlots()}
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
                                    <div className="flex justify-between">
                                        <span>Treasure</span>
                                        <span className="font-bold">{actor.items?.filter((i: any) => i.type === 'Treasure' && !i.system?.stashed).reduce((acc: number, i: any) => {
                                            return acc + calculateItemSlots(i);
                                        }, 0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Gems</span>
                                        <span className="font-bold">{actor.items?.filter((i: any) => i.type === 'Gem' && !i.system?.stashed).reduce((acc: number, i: any) => {
                                            return acc + calculateItemSlots(i);
                                        }, 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-neutral-400">
                                        <span>Coins</span>
                                        <span className="font-bold">0</span>
                                    </div>
                                </div>
                            </div>

                            {/* Coins Panel */}
                            <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <h3 className="font-serif font-bold text-lg border-b-2 border-black pb-1 mb-3 uppercase tracking-wide">Coins</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center bg-amber-100/50 p-2 rounded border border-amber-200">
                                        <span className="font-bold font-serif text-amber-800">GP</span>
                                        <span className="font-mono font-bold text-lg text-black">{actor.coins?.gp || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded border border-slate-200">
                                        <span className="font-bold font-serif text-slate-600">SP</span>
                                        <span className="font-mono font-bold text-lg text-black">{actor.coins?.sp || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-orange-100/50 p-2 rounded border border-orange-200">
                                        <span className="font-bold font-serif text-orange-800">CP</span>
                                        <span className="font-mono font-bold text-lg text-black">{actor.coins?.cp || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Gems Panel */}
                            <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-serif font-bold text-lg uppercase tracking-wide">Gems</h3>
                                    <span className="bg-black text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                        {actor.items?.filter((i: any) => i.type === 'Gem').length}
                                    </span>
                                </div>
                                <hr className="border-black mb-3" />
                                <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Gem Bag</h4>
                                <div className="space-y-1 mb-3">
                                    {actor.items?.filter((i: any) => i.type === 'Gem').map((gem: any) => (
                                        <div key={gem.id} className="flex justify-between text-sm font-serif border-b border-neutral-100 last:border-0 py-1">
                                            <span>{gem.name}</span>
                                            <span className="font-bold">{gem.system?.cost?.value || 0} gp</span>
                                        </div>
                                    ))}
                                    {(!actor.items?.some((i: any) => i.type === 'Gem')) && (
                                        <div className="text-center text-xs text-neutral-400 italic py-2">No gems.</div>
                                    )}
                                </div>
                                <hr className="border-black mb-3" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Total Value</span>
                                    <span className="font-serif font-bold text-xl">
                                        {actor.items?.filter((i: any) => i.type === 'Gem').reduce((acc: number, i: any) => acc + (Number(i.system?.cost?.value) || 0), 0)} gp
                                    </span>
                                </div>
                            </div>

                        </div>
                    </div>
                )}



                {activeTab === 'notes' && (
                    <div className="bg-white border-2 border-black p-6 shadow-sm min-h-[400px]">
                        <h3 className="font-serif font-bold text-2xl border-b-2 border-black pb-2 mb-4 uppercase tracking-wide">Biography & Notes</h3>
                        {actor.details?.biography ? (
                            <div
                                className="prose prose-neutral max-w-none font-serif [&_p]:mb-4 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold"
                                dangerouslySetInnerHTML={{ __html: formatDescription(actor.details.biography) || '' }}
                                onClick={handleDescriptionClick}
                            />
                        ) : (
                            <div className="text-neutral-400 italic text-center py-20">No biography or notes available.</div>
                        )}
                    </div>
                )}

                {activeTab === 'effects' && (
                    <div className="space-y-4">
                        {actor.effects && actor.effects.length > 0 ? (
                            actor.effects.map((effect: any) => (
                                <div key={effect.id} className={`bg-white border-2 border-black p-2 flex items-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${effect.disabled ? 'opacity-60 grayscale' : ''}`}>
                                    <img
                                        src={resolveImage(effect.icon)}
                                        alt={effect.label}
                                        className="w-10 h-10 object-cover border border-black bg-neutral-200"
                                    />
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-serif font-bold text-lg uppercase tracking-wide leading-none">{effect.label}</h3>
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${effect.disabled ? 'bg-neutral-200 text-neutral-500' : 'bg-green-100 text-green-800 border border-green-200'}`}>
                                                {effect.disabled ? 'Inactive' : 'Active'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-neutral-500 font-sans">
                                            {effect.duration?.rounds ? `${effect.duration.rounds} rounds` : (effect.duration?.seconds ? `${effect.duration.seconds}s` : 'Permanent')}
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-20 border-2 border-dashed border-neutral-300 text-neutral-400 font-serif italic text-xl">
                                No active effects.
                            </div>
                        )}
                    </div>
                )}

                {/* Debug Data Card */}
                {/* Hidden for now unless requested, or put at bottom very small */}
                <div className="mt-20 border-t border-neutral-200 pt-4">
                    <details className="text-xs font-mono text-neutral-400">
                        <summary className="cursor-pointer mb-2">Debug Data</summary>
                        <pre className="bg-neutral-100 p-4 overflow-auto rounded">{JSON.stringify(actor, null, 2)}</pre>
                    </details>
                </div>
            </div>

            <RollDialog
                isOpen={rollDialog.open}
                title={rollDialog.title}
                type={rollDialog.type}
                defaults={rollDialog.defaults}
                onConfirm={(options) => {
                    if (rollDialog.callback) rollDialog.callback(options);
                    setRollDialog(prev => ({ ...prev, open: false }));
                }}
                onClose={() => setRollDialog(prev => ({ ...prev, open: false }))}
            />
        </div>
    );
}
