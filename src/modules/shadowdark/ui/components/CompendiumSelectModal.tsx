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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-700 w-full max-w-lg max-h-[80vh] flex flex-col rounded-lg shadow-2xl animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <h2 className="text-xl font-bold font-serif text-white uppercase tracking-wider">Select {title}</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder={`Search ${title}...`}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-black text-white border border-neutral-700 rounded pl-9 pr-4 py-2 focus:border-amber-500 focus:outline-none placeholder:text-neutral-600"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
                    {filteredOptions.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            {filteredOptions.map((opt, i) => {
                                const isSelected = Array.isArray(currentValue)
                                    ? currentValue.includes(opt.name) || (opt.uuid && currentValue.includes(opt.uuid))
                                    : currentValue === opt.name || currentValue === opt.uuid;

                                return (
                                    <button
                                        key={opt.uuid || i}
                                        onClick={() => onSelect(opt)}
                                        className={`
                                            flex items-center justify-between text-left px-4 py-3 rounded group transition-colors
                                            ${isSelected ? 'bg-amber-900/20 border border-amber-900/50' : 'hover:bg-neutral-800 border border-transparent'}
                                        `}
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`font-bold font-serif ${isSelected ? 'text-amber-500' : 'text-neutral-200 group-hover:text-white'}`}>
                                                {opt.name}
                                            </span>
                                            {opt.description && (
                                                <span className="text-xs text-neutral-500 line-clamp-1" dangerouslySetInnerHTML={{ __html: opt.description.replace(/<[^>]*>?/gm, '') }} />
                                            )}
                                        </div>
                                        <div>
                                            {multiSelect ? (
                                                <div className={`w-5 h-5 border rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-600 border-amber-600' : 'border-neutral-600 group-hover:border-neutral-400'}`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 text-black" />}
                                                </div>
                                            ) : (
                                                isSelected && <Check className="w-4 h-4 text-amber-500" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-2">
                            <span className="text-4xl text-neutral-700">?</span>
                            <p>No matches found.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
