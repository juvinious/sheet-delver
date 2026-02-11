import React from 'react';
import { Plus, Minus, Coins, Dumbbell } from 'lucide-react';

interface StatPoolSelectionSectionProps {
    total: number;
    allocated: Record<string, number>;
    onChange: (stat: string, delta: number) => void;
}

const STATS = [
    { id: 'str', label: 'Strength' },
    { id: 'dex', label: 'Dexterity' },
    { id: 'con', label: 'Constitution' },
    { id: 'int', label: 'Intelligence' },
    { id: 'wis', label: 'Wisdom' },
    { id: 'cha', label: 'Charisma' }
];

export const StatPoolSelectionSection: React.FC<StatPoolSelectionSectionProps> = ({ total, allocated, onChange }) => {
    if (total <= 0) return null;

    const used = Object.values(allocated).reduce((a, b) => a + (Number(b) || 0), 0);
    const remaining = total - used;

    return (
        <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-dashed border-neutral-200">
                <div className="w-8 h-8 bg-amber-500 text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <Dumbbell size={16} />
                </div>
                <div>
                    <h3 className="font-serif font-black text-lg uppercase tracking-wider leading-none">Distribute Points</h3>
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">
                        Allocate {total} points across any stats
                    </p>
                </div>
                <div className={`ml-auto font-mono font-bold px-2 py-1 rounded text-xs border ${remaining === 0 ? 'bg-green-100 border-green-500 text-green-700' : 'bg-neutral-100 border-neutral-300 text-neutral-600'}`}>
                    {remaining} / {total} {remaining === 0 ? 'COMPLETE' : 'REMAINING'}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {STATS.map(stat => {
                    const value = allocated[stat.id] || 0;
                    const canAdd = remaining > 0;
                    const canSub = value > 0;

                    return (
                        <div
                            key={stat.id}
                            className={`
                                relative p-3 border-2 transition-all text-left flex items-center justify-between
                                ${value > 0
                                    ? 'bg-amber-50 border-amber-500 text-black shadow-[2px_2px_0px_0px_#f59e0b]'
                                    : 'bg-white border-neutral-200 text-neutral-600'
                                }
                            `}
                        >
                            <div className="flex flex-col">
                                <span className="font-bold uppercase tracking-wider text-xs">{stat.label}</span>
                                {value > 0 && (
                                    <span className="text-amber-600 font-black text-lg">+{value}</span>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => onChange(stat.id, -1)}
                                    disabled={!canSub}
                                    className={`
                                        w-8 h-8 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all
                                        ${canSub ? 'bg-white hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none' : 'bg-neutral-100 border-neutral-300 text-neutral-300 shadow-none opacity-50 cursor-not-allowed'}
                                    `}
                                >
                                    <Minus size={14} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => onChange(stat.id, 1)}
                                    disabled={!canAdd}
                                    className={`
                                        w-8 h-8 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all
                                        ${canAdd ? 'bg-black text-white hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none' : 'bg-neutral-100 border-neutral-300 text-neutral-300 shadow-none opacity-50 cursor-not-allowed'}
                                    `}
                                >
                                    <Plus size={14} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
