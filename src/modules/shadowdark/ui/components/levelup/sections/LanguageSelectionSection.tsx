
import React from 'react';

interface Props {
    languageGroups: any[];
    selectedLanguages: string[];
    fixedLanguages: string[];
    knownLanguages: any[];
    availableLanguages: any[];
    onSelectedLanguagesChange: (langs: string[]) => void;
}

export const LanguageSelectionSection = ({
    languageGroups,
    selectedLanguages,
    fixedLanguages,
    knownLanguages,
    availableLanguages,
    onSelectedLanguagesChange
}: Props) => {
    if (languageGroups.length === 0) return null;

    return (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden p-4">
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                <span>Languages</span>
                <div className="text-xs font-black bg-white text-black px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                    {selectedLanguages.length} Selected
                </div>
            </div>

            <div className="space-y-6">
                {languageGroups.map(group => {
                    const groupOptions = availableLanguages?.filter((l: any) => {
                        const id = l.uuid || l._id;
                        if (fixedLanguages.includes(id)) return false;
                        if (group.id === 'select') return group.options?.includes(id);
                        if (group.id === 'common') return !l.rarity || l.rarity === 'common';
                        if (group.id === 'rare') return l.rarity === 'rare';
                        return false;
                    }) || [];

                    const groupSelections = selectedLanguages.filter(lid => {
                        const opt = groupOptions.find((o: any) => (o.uuid || o._id) === lid);
                        if (!opt) return false;
                        return !knownLanguages.some(kl => kl.name?.toLowerCase() === opt.name?.toLowerCase());
                    });

                    return (
                        <div key={group.id} className="bg-neutral-50 p-3 border-2 border-black">
                            <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-neutral-300 pb-2">
                                <span className="font-serif font-black uppercase text-sm tracking-widest text-black">{group.label}</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 border-2 ${groupSelections.length === group.count ? 'bg-black text-white border-black' : 'bg-white text-neutral-400 border-neutral-200'}`}>
                                    {groupSelections.length} / {group.count}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {groupOptions.map(lang => {
                                    const uuid = lang.uuid || lang._id;
                                    const isSelected = selectedLanguages.includes(uuid);
                                    const isKnown = knownLanguages.some(k => k.name?.toLowerCase() === lang.name?.toLowerCase());

                                    if (isKnown) return null;

                                    return (
                                        <button
                                            key={uuid}
                                            disabled={!isSelected && groupSelections.length >= group.count}
                                            onClick={() => {
                                                if (isSelected) {
                                                    onSelectedLanguagesChange(selectedLanguages.filter(id => id !== uuid));
                                                } else {
                                                    onSelectedLanguagesChange([...selectedLanguages, uuid]);
                                                }
                                            }}
                                            className={`px-4 py-2 text-left text-xs font-bold uppercase tracking-wide transition-all border-2 ${isSelected
                                                    ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                                    : 'bg-white text-black border-black hover:bg-neutral-100 disabled:opacity-30 disabled:border-neutral-200 disabled:text-neutral-400'
                                                }`}
                                        >
                                            {lang.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {knownLanguages.length > 0 && (
                <div className="mt-6 pt-4 border-t-2 border-dashed border-neutral-200">
                    <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Known / Native Languages</h4>
                    <div className="flex flex-wrap gap-2">
                        {knownLanguages.map((kl, i) => (
                            <div key={i} className="bg-neutral-100 border-2 border-neutral-200 px-3 py-1 text-[10px] text-neutral-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-neutral-400 rotate-45"></span>
                                {kl.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
