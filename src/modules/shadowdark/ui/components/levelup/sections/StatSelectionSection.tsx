import React from 'react';
import { Dumbbell } from 'lucide-react';

interface StatSelectionSectionProps {
    required: number;
    selected: string[];
    onToggle: (stat: string) => void;
}

const STATS = [
    { id: 'str', label: 'Strength' },
    { id: 'dex', label: 'Dexterity' },
    { id: 'con', label: 'Constitution' },
    { id: 'int', label: 'Intelligence' },
    { id: 'wis', label: 'Wisdom' },
    { id: 'cha', label: 'Charisma' }
];

export const StatSelectionSection: React.FC<StatSelectionSectionProps> = ({ required, selected, onToggle }) => {
    if (required <= 0) return null;

    return (
        <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-dashed border-neutral-200">
                <div className="w-8 h-8 bg-amber-500 text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <Dumbbell size={16} />
                </div>
                <div>
                    <h3 className="font-serif font-black text-lg uppercase tracking-wider leading-none">Ability Improvement</h3>
                    <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-1">
                        Select {required} stats to improve by +1
                    </p>
                </div>
                <div className="ml-auto font-mono font-bold bg-neutral-100 px-2 py-1 rounded text-xs border border-neutral-300">
                    {selected.length} / {required}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {STATS.map(stat => {
                    const isSelected = selected.includes(stat.id);
                    const disabled = !isSelected && selected.length >= required;

                    return (
                        <button
                            key={stat.id}
                            onClick={() => onToggle(stat.id)}
                            disabled={disabled}
                            className={`
                                relative p-3 border-2 transition-all text-left group
                                ${isSelected
                                    ? 'bg-amber-100 border-amber-500 text-black shadow-[2px_2px_0px_0px_#f59e0b]'
                                    : disabled
                                        ? 'bg-neutral-50 border-neutral-200 text-neutral-300 cursor-not-allowed'
                                        : 'bg-white border-neutral-200 hover:border-black text-neutral-600 hover:text-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                }
                            `}
                        >
                            <span className="font-bold uppercase tracking-wider text-sm">{stat.label}</span>
                            {isSelected && (
                                <span className="absolute top-2 right-2 text-amber-600 font-bold text-xs">+1</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
