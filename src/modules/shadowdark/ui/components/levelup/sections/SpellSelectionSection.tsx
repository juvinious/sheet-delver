
import { SectionStatus } from '../useLevelUp';

import React from 'react';

interface Props {
    isSpellcaster: boolean;
    spellsToChooseTotal: number;
    spellsToChoose: Record<number, number>;
    availableSpells: any[];
    selectedSpells: any[];
    blockedSpells?: any[];
    status: SectionStatus;
    onSelectedSpellsChange: (spells: any[]) => void;
}

export const SpellSelectionSection = ({
    isSpellcaster,
    spellsToChooseTotal,
    spellsToChoose,
    availableSpells,
    selectedSpells,
    blockedSpells = [],
    status,
    onSelectedSpellsChange
}: Props) => {
    if (!isSpellcaster || spellsToChooseTotal <= 0) return null;

    if (status === 'LOADING') {
        return <div className="p-4 text-center">Loading Spells...</div>;
    }

    return (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden p-4">
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                <span>Spells to Learn</span>
                <div className="text-xs font-black bg-white text-black px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                    {selectedSpells.length} / {spellsToChooseTotal} Selected
                </div>
            </div>

            <div className="space-y-6">
                {Object.entries(spellsToChoose).map(([tierStr, count]) => {
                    const tier = parseInt(tierStr);
                    if (count <= 0) return null;

                    const tierSpells = availableSpells.filter(s => {
                        const t = s.tier ?? s.system?.tier ?? 0;
                        return Number(t) === tier;
                    });

                    const selectedInTier = selectedSpells.filter(s => {
                        const t = s.tier ?? s.system?.tier ?? 0;
                        return Number(t) === tier;
                    });

                    return (
                        <div key={tier} className="bg-neutral-50 p-3 border-2 border-black">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-neutral-300 pb-2">
                                <span className="font-serif font-black uppercase text-sm tracking-widest text-black">Tier {tier} Spells</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 border-2 ${selectedInTier.length === count ? 'bg-black text-white border-black' : 'bg-white text-neutral-400 border-neutral-200'}`}>
                                    {selectedInTier.length} / {count}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {tierSpells.map(spell => {
                                    const uuid = spell.uuid || spell._id;
                                    const isSelected = selectedSpells.some(s => (s.uuid || s._id) === uuid);
                                    const isBlocked = blockedSpells.some(s => (s.uuid || s._id) === uuid);

                                    return (
                                        <button
                                            key={uuid}
                                            disabled={isBlocked || (!isSelected && selectedInTier.length >= count)}
                                            onClick={() => {
                                                if (isSelected) {
                                                    onSelectedSpellsChange(selectedSpells.filter(s => (s.uuid || s._id) !== uuid));
                                                } else {
                                                    onSelectedSpellsChange([...selectedSpells, spell]);
                                                }
                                            }}
                                            className={`px-4 py-2 text-left text-xs font-bold uppercase tracking-wide transition-all border-2 ${isSelected
                                                ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
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
