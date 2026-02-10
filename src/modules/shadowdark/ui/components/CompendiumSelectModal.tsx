import { useState, useMemo } from 'react';
import { X, Search, Check } from 'lucide-react';

interface Option {
    name: string;
    uuid?: string;
    description?: string;
    source?: string;
}

interface CompendiumSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (value: Option) => void;
    title: string;
    options: Option[];
    currentValue?: string | string[];
    multiSelect?: boolean;
}

export default function CompendiumSelectModal({ isOpen, onClose, onSelect, title, options, currentValue, multiSelect }: CompendiumSelectModalProps) {
    const [search, setSearch] = useState('');

    const filteredOptions = useMemo(() => {
        let result = options;
        if (search) {
            const lower = search.toLowerCase();
            result = options.filter(o =>
                o.name.toLowerCase().includes(lower) ||
                (o.description && o.description.toLowerCase().includes(lower))
            );
        }
        return [...result].sort((a, b) => a.name.localeCompare(b.name));
    }, [options, search]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white border-4 border-black w-full max-w-lg max-h-[80vh] flex flex-col shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200 overflow-hidden text-neutral-900 rounded-none">

                {/* Header */}
                <div className="flex items-center justify-between p-6 bg-black text-white border-b-2 border-white">
                    <h2 className="text-2xl font-black font-serif uppercase tracking-widest">Select {title}</h2>
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
                            placeholder={`Search ${title}...`}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-white text-black border-2 border-black px-4 py-2 pl-9 focus:bg-neutral-50 outline-none uppercase tracking-widest font-bold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {filteredOptions.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {filteredOptions.map((opt, i) => {
                                const isSelected = Array.isArray(currentValue)
                                    ? currentValue.includes(opt.name) || (opt.uuid && currentValue.includes(opt.uuid))
                                    : currentValue === opt.name || currentValue === opt.uuid;

                                return (
                                    <button
                                        key={opt.uuid || i}
                                        onClick={() => onSelect(opt)}
                                        className={`
                                            flex items-center justify-between text-left px-4 py-3 border-2 transition-all
                                            ${isSelected
                                                ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                                : 'bg-white text-black border-neutral-200 hover:border-black shadow-sm'
                                            }
                                        `}
                                    >
                                        <div className="flex flex-col gap-0.5 overflow-hidden">
                                            <span className="font-serif font-black uppercase tracking-wider text-sm truncate">
                                                {opt.name}
                                            </span>
                                            {opt.description && (
                                                <span className={`text-[10px] font-medium line-clamp-1 ${isSelected ? 'text-white/60' : 'text-neutral-500'}`} dangerouslySetInnerHTML={{ __html: opt.description.replace(/<[^>]*>?/gm, '') }} />
                                            )}
                                        </div>
                                        <div className="shrink-0 ml-4">
                                            {multiSelect ? (
                                                <div className={`w-5 h-5 border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-white border-white' : 'border-neutral-300'}`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 text-black" />}
                                                </div>
                                            ) : (
                                                isSelected && <Check className="w-4 h-4 text-white" strokeWidth={3} />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
                            <span className="text-4xl">?</span>
                            <p className="font-bold uppercase tracking-widest text-xs italic">No matches found.</p>
                        </div>
                    )}
                </div>

                {/* Footer (Consistency with Language modal) */}
                <div className="p-6 bg-neutral-100 border-t-4 border-black flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="h-12 bg-neutral-200 text-black border-2 border-black px-8 font-black font-serif uppercase tracking-widest text-xs hover:bg-neutral-300 transition-all active:translate-x-[2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
