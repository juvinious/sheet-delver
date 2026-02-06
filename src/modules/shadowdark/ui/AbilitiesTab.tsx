'use client';

import { useState, useEffect } from 'react';
import { resolveEntityName } from './sheet-utils';
import { useConfig } from '@/app/ui/context/ConfigContext';

interface AbilitiesTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    triggerRollDialog: (type: string, key: string, name?: string) => void;
    onRoll?: (type: string, key: string, options?: any) => void;
}

export default function AbilitiesTab({ actor, onUpdate, triggerRollDialog, onRoll }: AbilitiesTabProps) {
    const { resolveImageUrl } = useConfig();

    // Common container style for standard sheet feel
    const cardStyle = "bg-white border-2 border-black p-4 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative";

    // Optimistic Logic
    const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, any>>({});

    // Clear overrides when actor data updates (server sync)
    useEffect(() => {
        setOptimisticOverrides({});
    }, [actor]);

    const handleOptimisticUpdate = (path: string, value: any) => {
        setOptimisticOverrides(prev => ({ ...prev, [path]: value }));
        onUpdate(path, value);
    };

    const getValue = (path: string, fallback: any) => {
        return optimisticOverrides[path] !== undefined ? optimisticOverrides[path] : fallback;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">


            {/* LEFT COLUMN: Vitals, Stats */}
            <div className="md:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-20">

                {/* HP Box */}
                {actor.system?.attributes?.hp && (
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 flex justify-between items-center px-2 border-b border-white">
                            <span className="font-serif font-bold text-lg">HP</span>
                            <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                        </div>
                        <div className="flex justify-center items-baseline gap-2 font-serif text-3xl font-bold pt-2">
                            <input
                                key={actor.system.attributes.hp.value}
                                type="number"
                                defaultValue={actor.system.attributes.hp.value}
                                onBlur={(e) => {
                                    let val = parseInt(e.target.value);
                                    const max = actor.computed?.maxHp || 1;
                                    if (val > max) val = max;
                                    if (val !== parseInt(e.target.value)) e.target.value = val.toString();
                                    if (val !== actor.system.attributes.hp.value) onUpdate('system.attributes.hp.value', val);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                className="w-16 text-center bg-neutral-100 rounded border-b-2 border-neutral-300 focus:border-black outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-neutral-400 text-xl font-sans font-light">/</span>
                            <span>{actor.computed?.maxHp ?? actor.system.attributes.hp.max}</span>
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
                            {actor.computed?.ac ?? actor.system?.attributes?.ac?.value ?? 10}
                        </div>
                    </div>
                    {/* Luck */}
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                            <span className="font-serif font-bold text-lg">LUCK</span>
                        </div>
                        <div className="flex justify-center py-2 h-full items-center">
                            <button
                                onClick={() => onUpdate('system.luck.available', !actor.system?.luck?.available)}
                                className={`w-8 h-8 rounded border-2 border-black shadow-sm flex items-center justify-center transition-all bg-white hover:bg-neutral-100`}
                            >
                                {actor.system?.luck?.available && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-5 h-5 text-black">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* XP Progress */}
                {actor.system?.level && (
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between items-center border-b border-white">
                            <span className="font-serif font-bold text-lg">LEVEL {actor.system.level.value}</span>
                            {actor.computed?.levelUp && (
                                <span className="bg-amber-500 text-black px-2 py-0.5 text-xs font-bold rounded animate-pulse">
                                    LEVEL UP!
                                </span>
                            )}
                        </div>
                        <div className="py-2">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-neutral-600">XP Progress</span>
                                <span className="font-bold">
                                    {actor.system.level.xp ?? 0} / {actor.computed?.xpNextLevel ?? (actor.system.level.value * 10)}
                                </span>
                            </div>
                            <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-black h-full transition-all duration-300"
                                    style={{
                                        width: `${Math.min(100, ((actor.system.level.xp ?? 0) / (actor.computed?.xpNextLevel ?? (actor.system.level.value * 10))) * 100)}%`
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Grid */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                        <span className="font-serif font-bold text-lg">STATS</span>
                        <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        {Object.entries(actor.attributes || actor.computed?.abilities || actor.system?.abilities || {}).map(([key, stat]: [string, any], idx) => (
                            <div key={`stat-${key}-${idx}`}
                                className="flex flex-col items-center bg-neutral-100 border-2 border-neutral-300 rounded cursor-pointer transition-all hover:border-black hover:bg-white hover:scale-105 active:scale-95 group overflow-hidden"
                                onClick={() => triggerRollDialog('ability', key)}>
                                <div className="w-full bg-neutral-200 text-center py-1 border-b border-neutral-300 group-hover:bg-neutral-800 transition-colors">
                                    <span className="font-bold text-xs uppercase tracking-widest text-neutral-600 group-hover:text-white transition-colors">{key}</span>
                                </div>
                                <div className="flex flex-col items-center py-2">
                                    <span className="font-serif text-2xl font-bold leading-none mb-1 text-black">{stat.value}</span>
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
            <div className="md:col-span-2 flex flex-col gap-6 overflow-y-auto pb-20">

                {/* Melee Attacks */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                        <span className="font-serif font-bold text-lg uppercase">Melee Attacks</span>
                    </div>
                    <div className="space-y-2">
                        {(actor.derived?.attacks?.melee || []).map((item: any, idx: number) => (
                            <div
                                key={item.id || item._id || `melee-${idx}`}
                                onClick={() => triggerRollDialog('item', item.id || item._id)}
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
                                        <span className="font-bold">{item.derived?.toHit}</span> to hit, <span className="font-bold">{item.derived?.damage}</span> dmg
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
                        ))}
                        {(!actor.derived?.attacks?.melee || actor.derived.attacks.melee.length === 0) && (
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
                        {(actor.derived?.attacks?.ranged || []).map((item: any, idx: number) => (
                            <div
                                key={item.id || item._id || `ranged-${idx}`}
                                onClick={() => triggerRollDialog('item', item.id || item._id)}
                                className="bg-neutral-50 p-2 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors cursor-pointer group"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold font-serif text-lg leading-none">{item.name}</span>
                                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
                                            ({item.derived?.range ? item.derived.range.charAt(0).toUpperCase() + item.derived.range.slice(1) : '-'})
                                        </span>
                                    </div>
                                    <div className="text-sm text-neutral-700 font-sans mt-1">
                                        <span className="font-bold">{item.derived?.toHit}</span> to hit, <span className="font-bold">{item.derived?.damage}</span> dmg
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
                        ))}
                        {(!actor.derived?.attacks?.ranged || actor.derived.attacks.ranged.length === 0) && (
                            <div className="text-neutral-400 text-sm italic text-center py-2">No ranged weapons equipped.</div>
                        )}
                    </div>
                </div>

                {/* Special Abilities (Limited Use) */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                        <span className="font-serif font-bold text-lg uppercase">Special Abilities</span>
                    </div>
                    <div className="space-y-4">
                        {(() => {


                            const specialItems = (actor.items?.filter((i: any) =>
                                ['Talent', 'Feature', 'Ability', 'NPC Feature', 'Class Ability'].includes(i.type) &&
                                (i.system?.uses?.max > 0 || i.system?.uses?.value > 0)
                            ) || []);

                            if (specialItems.length === 0) {
                                return <div className="text-neutral-400 text-sm italic text-center py-2">No special abilities with limited uses.</div>;
                            }

                            // Grouping
                            const grouped: Record<string, any[]> = {};
                            specialItems.forEach((item: any) => {
                                let group = "General";
                                const src = item.system?.source;
                                if (src) {
                                    if (typeof src === 'string') group = src;
                                    else if (typeof src === 'object') group = src.title || src.name || src.label || "General";
                                }
                                else if (item.system?.talentClass === 'class') group = resolveEntityName(actor.system?.class, actor, {}, 'classes') || "Class";
                                else if (item.system?.talentClass === 'ancestry') group = resolveEntityName(actor.system?.ancestry, actor, {}, 'ancestries') || "Ancestry";

                                if (!grouped[group]) grouped[group] = [];
                                grouped[group].push(item);
                            });

                            return Object.entries(grouped).map(([group, items], gIdx) => (
                                <div key={`group-${group}-${gIdx}`}>
                                    {/* Header Row */}
                                    <div className="flex justify-between items-center border-b-2 border-black pb-1 mb-1 text-black font-bold text-sm uppercase">
                                        <div className="flex-1">{group}</div>
                                        <div className="w-24 text-center">Uses</div>
                                        <div className="w-16 text-right">Actions</div>
                                    </div>

                                    <div className="divide-y divide-neutral-200">
                                        {items.map((item: any, idx) => {
                                            // Prefer 'available' if present, otherwise 'value'
                                            const usesKey = item.system?.uses?.available !== undefined ? 'available' : 'value';
                                            const usesPath = `items.${item.id}.system.uses.${usesKey}`;
                                            const lostPath = `items.${item.id}.system.lost`;

                                            // Optimistic or Real values
                                            const realCurrent = item.system?.uses?.[usesKey] ?? 0;
                                            const currentUses = getValue(usesPath, realCurrent);
                                            const maxUses = item.system?.uses?.max || 0;
                                            const isLost = getValue(lostPath, item.system?.lost || false);

                                            return (
                                                <div
                                                    key={item.id || item._id || `ability-${idx}`}
                                                    className="py-2 flex items-center text-sm hover:bg-neutral-50 group"
                                                >
                                                    {/* Col 1: Image + Name */}
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <img
                                                            src={resolveImageUrl(item.img)}
                                                            className="w-8 h-8 border border-black object-cover bg-neutral-200"
                                                            alt={item.name}
                                                        />
                                                        <span className={`font-serif font-bold text-lg leading-tight ${isLost ? 'opacity-50 line-through' : ''}`}>{item.name}</span>
                                                    </div>

                                                    {/* Col 2: Uses (- X/Y +) */}
                                                    <div className="w-24 flex items-center justify-center gap-1">
                                                        <button
                                                            onClick={() => {
                                                                if (currentUses > 0) handleOptimisticUpdate(usesPath, currentUses - 1);
                                                            }}
                                                            className="w-5 h-5 flex items-center justify-center hover:bg-neutral-200 rounded text-neutral-600 font-bold disabled:opacity-30"
                                                            disabled={currentUses <= 0 || isLost}
                                                        >
                                                            -
                                                        </button>
                                                        <span className={`font-mono font-bold text-sm min-w-[3ch] text-center ${isLost ? 'opacity-50' : ''}`}>
                                                            {currentUses}/{maxUses}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                if (currentUses < maxUses) handleOptimisticUpdate(usesPath, currentUses + 1);
                                                            }}
                                                            className="w-5 h-5 flex items-center justify-center hover:bg-neutral-200 rounded text-neutral-600 font-bold disabled:opacity-30"
                                                            disabled={currentUses >= maxUses || isLost}
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    {/* Col 3: Actions (Use Die | Checkbox) */}
                                                    <div className="w-16 flex items-center justify-end gap-2 pr-1">
                                                        {/* Use Item Button */}
                                                        <button
                                                            className="text-neutral-400 hover:text-black transition-colors transform hover:scale-110 flex items-center justify-center p-1 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:text-neutral-400"
                                                            title="Use Ability (Post to Chat)"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (currentUses > 0) {
                                                                    if (onRoll) {
                                                                        onRoll('use-item', item.id); // Direct call, bypass dialog
                                                                    } else {
                                                                        // Fallback if no direct roll provided (though it should be)
                                                                        triggerRollDialog('use-item', item.id);
                                                                    }
                                                                    handleOptimisticUpdate(usesPath, currentUses - 1);
                                                                }
                                                            }}
                                                            disabled={currentUses <= 0 || isLost}
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                                                <path d="M12 2L2 22h20L12 2zm0 3.5 6 12H6l6-12z" />
                                                                <text x="12" y="19" fontSize="8" fontWeight="bold" textAnchor="middle" fill="white">20</text>
                                                            </svg>
                                                        </button>

                                                        {/* Lost Toggle (Optimistic) */}
                                                        <button
                                                            className={`transition-all flex items-center justify-center rounded-full w-6 h-6 border shadow-sm ${isLost ? 'bg-red-100 border-red-500 text-red-600 hover:scale-110' : 'bg-white border-neutral-300 text-neutral-300 hover:border-black hover:text-black hover:scale-110'}`}
                                                            title={isLost ? "Restore Ability" : "Mark as Lost"}
                                                            onClick={() => handleOptimisticUpdate(lostPath, !isLost)}
                                                        >
                                                            {isLost ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                                </svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>



            </div>
        </div>
    );
}
