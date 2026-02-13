
import React from 'react';
import { SectionStatus } from '../useLevelUp';

interface Props {
    active: boolean;
    maxTier: number;
    source: string;
    availableSpells: any[];
    selectedSpells: any[];
    blockedSpells?: any[];
    status: SectionStatus;
    onSelectionChange: (spells: any[]) => void;
}

export const ExtraSpellSelectionSection = ({
    active,
    maxTier,
    source,
    availableSpells,
    selectedSpells,
    blockedSpells = [],
    status,
    onSelectionChange
}: Props) => {
    if (!active) return null;

    if (status === 'LOADING') {
        return (
            <div className="bg-white border-2 border-black p-4 mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="text-center font-bold animate-pulse">Loading {source} Spells...</div>
            </div>
        );
    }

    // Filter spells by max tier
    const validSpells = availableSpells.filter(s => {
        const t = Number(s.tier ?? s.system?.tier ?? 0);
        return t > 0 && t <= maxTier;
    }).sort((a, b) => {
        const tA = Number(a.tier ?? a.system?.tier ?? 0);
        const tB = Number(b.tier ?? b.system?.tier ?? 0);
        return tA - tB || a.name.localeCompare(b.name);
    });

    const groupedByTier: Record<number, any[]> = {};
    validSpells.forEach(s => {
        const t = Number(s.tier ?? s.system?.tier ?? 0);
        if (!groupedByTier[t]) groupedByTier[t] = [];
        groupedByTier[t].push(s);
    });

    return (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden p-4">
            <div className="bg-indigo-900 text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                <span>Bonus Spell ({source})</span>
                <div className="text-xs font-black bg-white text-indigo-900 px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                    {selectedSpells.length} / 1 Selected
                </div>
            </div>

            <div className="space-y-6">
                {Object.entries(groupedByTier).map(([tierStr, spells]) => {
                    const tier = Number(tierStr);
                    return (
                        <div key={tier} className="bg-neutral-50 p-3 border-2 border-black">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-neutral-300 pb-2">
                                <span className="font-serif font-black uppercase text-sm tracking-widest text-black">Tier {tier} Spells</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {spells.map(spell => {
                                    const uuid = spell.uuid || spell._id;
                                    const isSelected = selectedSpells.some(s => (s.uuid || s._id) === uuid);
                                    const isBlocked = blockedSpells.some(s => (s.uuid || s._id) === uuid);

                                    return (
                                        <button
                                            key={uuid}
                                            disabled={isBlocked || (!isSelected && selectedSpells.length >= 1)}
                                            onClick={() => {
                                                if (isSelected) onSelectionChange([]);
                                                else onSelectionChange([spell]);
                                            }}
                                            className={`px-4 py-2 text-left text-xs font-bold uppercase tracking-wide transition-all border-2 ${isSelected
                                                ? 'bg-indigo-600 text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                                : isBlocked
                                                    ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed opacity-50'
                                                    : 'bg-white text-black border-black hover:bg-neutral-100 disabled:opacity-30 disabled:border-neutral-200 disabled:text-neutral-400'
                                                }`}
                                        >
                                            {spell.name} {isBlocked && <span className="text-[8px] opacity-70 ml-1">(Alt Source)</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
