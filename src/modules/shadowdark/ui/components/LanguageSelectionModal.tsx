import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';

interface Language {
    name: string;
    uuid: string;
    rarity?: 'common' | 'rare';
}

interface LanguageSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (languages: string[]) => void;
    availableLanguages: Language[];
    currentLanguages: string[]; // UUIDs or Names
    maxCommon: number;
    maxRare: number;
}

export default function LanguageSelectionModal({
    isOpen,
    onClose,
    onSelect,
    availableLanguages,
    currentLanguages,
    maxCommon,
    maxRare
}: LanguageSelectionModalProps) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>(currentLanguages);

    const filteredLanguages = useMemo(() => {
        let langs = availableLanguages;
        if (search) {
            const lower = search.toLowerCase();
            langs = availableLanguages.filter(l => l.name.toLowerCase().includes(lower));
        }
        return [...langs].sort((a, b) => a.name.localeCompare(b.name));
    }, [availableLanguages, search]);

    const commonLanguages = filteredLanguages.filter(l => !l.rarity || l.rarity === 'common');
    const rareLanguages = filteredLanguages.filter(l => l.rarity === 'rare');

    // Count currently selected by category
    const selectedCommonCount = selected.filter(id => {
        const lang = availableLanguages.find(l => l.uuid === id || l.name === id);
        return !lang?.rarity || lang.rarity === 'common';
    }).length;

    const selectedRareCount = selected.filter(id => {
        const lang = availableLanguages.find(l => l.uuid === id || l.name === id);
        return lang?.rarity === 'rare';
    }).length;

    const toggleLanguage = (uuid: string) => {
        const lang = availableLanguages.find(l => l.uuid === uuid);
        const name = lang?.name;
        const isSelected = selected.includes(uuid) || (!!name && selected.includes(name));

        if (!isSelected) {
            const isRare = lang?.rarity === 'rare';
            if (isRare && selectedRareCount >= maxRare) return;
            if (!isRare && selectedCommonCount >= maxCommon) return;
        }

        setSelected(prev => {
            if (isSelected) {
                return prev.filter(id => id !== uuid && id !== name);
            } else {
                return [...prev, uuid];
            }
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white border-4 border-black w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 overflow-hidden text-neutral-900 rounded-none">

                {/* Header */}
                <div className="flex items-center justify-between p-6 bg-black text-white border-b-2 border-white">
                    <h2 className="text-2xl font-black font-serif uppercase tracking-widest">Edit Languages</h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-2">
                        <X size={24} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b-2 border-dashed border-neutral-200 bg-neutral-50/50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search languages..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-white text-black border-2 border-black px-4 py-2 pl-9 focus:bg-neutral-50 outline-none uppercase tracking-widest font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {/* Common Section */}
                    {commonLanguages.length > 0 && (
                        <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <div className="bg-black text-white px-4 py-1 -mx-4 -mt-4 mb-4 font-serif font-bold flex justify-between items-center uppercase tracking-wider">
                                <span>Common Languages</span>
                                <span className={`text-[10px] px-2 border border-white/50 ${selectedCommonCount === maxCommon ? 'text-white' : 'text-white/50'}`}>
                                    {selectedCommonCount} / {maxCommon}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {commonLanguages.map((lang, idx) => {
                                    const isSelected = selected.includes(lang.uuid) || selected.includes(lang.name);
                                    const disabled = !isSelected && selectedCommonCount >= maxCommon;
                                    return (
                                        <button
                                            key={lang.uuid || `common-lang-${idx}`}
                                            onClick={() => toggleLanguage(lang.uuid)}
                                            disabled={disabled}
                                            className={`px-3 py-2 text-left text-[10px] font-black uppercase transition-all border-2 ${isSelected
                                                ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                                : 'bg-white text-black border-neutral-200 hover:border-black'
                                                } ${disabled ? 'opacity-20 grayscale' : ''}`}
                                        >
                                            <span className="truncate">{lang.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Rare Section */}
                    {rareLanguages.length > 0 && maxRare > 0 && (
                        <div className="bg-purple-50 border-2 border-purple-900 p-4 shadow-[4px_4px_0px_0px_rgba(88,28,135,1)]">
                            <div className="bg-purple-900 text-white px-4 py-1 -mx-4 -mt-4 mb-4 font-serif font-bold flex justify-between items-center uppercase tracking-wider">
                                <span>Rare Languages</span>
                                <span className={`text-[10px] px-2 border border-purple-300/50 ${selectedRareCount === maxRare ? 'text-white' : 'text-white/50'}`}>
                                    {selectedRareCount} / {maxRare}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {rareLanguages.map((lang, idx) => {
                                    const isSelected = selected.includes(lang.uuid) || selected.includes(lang.name);
                                    const disabled = !isSelected && selectedRareCount >= maxRare;
                                    return (
                                        <button
                                            key={lang.uuid || `rare-lang-${idx}`}
                                            onClick={() => toggleLanguage(lang.uuid)}
                                            disabled={disabled}
                                            className={`px-3 py-2 text-left text-[10px] font-black uppercase transition-all border-2 ${isSelected
                                                ? 'bg-purple-900 text-white border-purple-900 shadow-[2px_2px_0px_0px_rgba(88,28,135,1)]'
                                                : 'bg-white text-purple-900 border-purple-200 hover:border-purple-900'
                                                } ${disabled ? 'opacity-20 grayscale' : ''}`}
                                        >
                                            <span className="truncate">{lang.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {filteredLanguages.length === 0 && (
                        <div className="text-center py-10 text-neutral-400 font-bold uppercase tracking-widest text-xs italic">No languages matched.</div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-neutral-100 border-t-4 border-black flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="text-black hover:text-red-700 font-black uppercase tracking-widest text-xs px-4 py-2 hover:bg-neutral-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSelect(selected)}
                        className="bg-black text-white px-10 py-3 font-serif font-black text-lg uppercase tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-neutral-800 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                        Save Languages
                    </button>
                </div>
            </div>
        </div>
    );
}
