
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { resolveImage, formatDescription, getSafeDescription } from '../sheet-utils';
import { useConfig } from '@/app/ui/context/ConfigContext';

interface SpellOption {
    name: string;
    uuid: string;
    img?: string;
    tier: number;
    class?: string[];
    description?: string;
    system?: any; // To support getSafeDescription
}

interface SpellSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (selected: SpellOption[]) => void;
    title: string;
    availableSpells: SpellOption[];
    knownSpells: SpellOption[];
    maxSelections?: number;
}

export default function SpellSelectionModal({
    isOpen,
    onClose,
    onSave,
    title,
    availableSpells,
    knownSpells,
    maxSelections
}: SpellSelectionModalProps) {
    const { resolveImageUrl } = useConfig();
    const [search, setSearch] = useState('');
    const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
    const [expandedUuids, setExpandedUuids] = useState<Set<string>>(new Set());
    const [fetchedData, setFetchedData] = useState<Record<string, { description: string, system: any }>>({});
    const [loadingUuids, setLoadingUuids] = useState<Set<string>>(new Set());

    const toggleExpand = async (spell: SpellOption) => {
        const newSet = new Set(expandedUuids);
        if (newSet.has(spell.uuid)) {
            newSet.delete(spell.uuid);
        } else {
            newSet.add(spell.uuid);
            // Fetch description if not already loaded or present
            if (!spell.description && !fetchedData[spell.uuid]) {
                await loadDescription(spell);
            }
        }
        setExpandedUuids(newSet);
    };

    const loadDescription = async (spell: SpellOption) => {
        setLoadingUuids(prev => new Set(prev).add(spell.uuid));
        try {
            const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(spell.uuid)}`);
            if (res.ok) {
                const doc = await res.json();
                const desc = getSafeDescription(doc.system);
                setFetchedData(prev => ({
                    ...prev,
                    [spell.uuid]: {
                        description: desc,
                        system: doc.system
                    }
                }));
            }
        } catch (e) {
            console.error("Failed to fetch description", e);
        } finally {
            setLoadingUuids(prev => {
                const next = new Set(prev);
                next.delete(spell.uuid);
                return next;
            });
        }
    };

    // Initialize selection from known spells
    useEffect(() => {
        if (isOpen) {
            const initialSet = new Set<string>();
            // Use names to match as UUIDs might differ between compendiums and actors
            const knownNames = new Set(knownSpells.map(s => s.name));
            availableSpells.forEach(s => {
                if (knownNames.has(s.name)) {
                    initialSet.add(s.uuid);
                }
            });
            setSelectedUuids(initialSet);
        }
    }, [isOpen, knownSpells, availableSpells]);

    const filteredSpells = useMemo(() => {
        let result = availableSpells;
        if (search) {
            const lower = search.toLowerCase();
            result = availableSpells.filter(s =>
                s.name.toLowerCase().includes(lower)
            );
        }
        return result.sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            return a.name.localeCompare(b.name);
        });
    }, [availableSpells, search]);

    const toggleSpell = (uuid: string) => {
        const newSet = new Set(selectedUuids);
        if (newSet.has(uuid)) {
            newSet.delete(uuid);
        } else {
            if (maxSelections && newSet.size >= maxSelections) return;
            newSet.add(uuid);
        }
        setSelectedUuids(newSet);
    };

    const isMaxReached = maxSelections ? selectedUuids.size >= maxSelections : false;

    const handleSave = () => {
        const selected = availableSpells.filter(s => selectedUuids.has(s.uuid));
        onSave(selected);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className="bg-neutral-100 w-full max-w-5xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col border-4 border-black"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-black text-white p-4 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-serif font-bold tracking-wider uppercase">{title}</h2>
                        <div className="text-xs font-sans tracking-widest uppercase mt-1 text-neutral-400">
                            Selected: <span className={selectedUuids.size > (maxSelections || 99) ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>{selectedUuids.size}</span>
                            {maxSelections !== undefined && (
                                <> / <span className="text-white">{maxSelections}</span></>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Filter spells by name..."
                            className="w-full pl-12 pr-4 py-4 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all outline-none font-serif text-xl"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Table Header */}
                    <div className="border-b-2 border-black pb-2 px-2 flex items-end justify-between font-serif font-bold uppercase tracking-widest text-neutral-500 text-[10px]">
                        <div className="flex-1 pl-12 flex items-center justify-between">
                            <span className="font-bold">Spell Name</span>
                            {expandedUuids.size > 0 && (
                                <button
                                    onClick={() => setExpandedUuids(new Set())}
                                    className="mr-4 text-amber-600 hover:text-amber-700 underline flex items-center gap-1 transition-colors"
                                >
                                    <ChevronUp className="w-3 h-3" />
                                    Collapse All
                                </button>
                            )}
                        </div>
                        <span className="w-12 text-center">Select</span>
                    </div>

                    {/* Spell List */}
                    <div className="flex-1 overflow-y-auto space-y-0 pr-2 custom-scrollbar border-t-2 border-black">
                        {filteredSpells.map((spell, idx) => {
                            const isSelected = selectedUuids.has(spell.uuid);
                            const isExpanded = expandedUuids.has(spell.uuid);
                            const disabled = !isSelected && isMaxReached;
                            const fetched = fetchedData[spell.uuid];
                            const description = spell.description || fetched?.description;
                            const isLoading = loadingUuids.has(spell.uuid);

                            return (
                                <div key={(spell as any).uuid || (spell as any)._id || `spell-select-${idx}`} className={`border-b border-black/20 last:border-b-0 transition-all ${isSelected ? 'bg-amber-50/50' : 'bg-white hover:bg-neutral-50'}`}>
                                    <div
                                        className={`flex items-center gap-3 py-1.5 px-2 cursor-pointer transition-colors`}
                                        onClick={() => toggleExpand(spell)}
                                    >
                                        {/* Image */}
                                        <div className="w-10 h-10 border border-black bg-black flex-shrink-0 flex items-center justify-center overflow-hidden">
                                            {spell.img ? (
                                                <img src={resolveImageUrl(spell.img)} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-white font-serif font-bold text-lg">{spell.name.charAt(0)}</span>
                                            )}
                                        </div>

                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-serif font-bold text-base uppercase leading-tight truncate flex items-center gap-2">
                                                {spell.name}
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                                            </div>
                                        </div>

                                        {/* Select Button */}
                                        <div className="w-12 flex justify-center">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSpell(spell.uuid);
                                                }}
                                                disabled={disabled}
                                                className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center transition-all ${isSelected ? 'bg-black text-white' : 'bg-white hover:border-amber-500'}`}
                                            >
                                                {isSelected && <Check className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Info */}
                                    {isExpanded && (
                                        <div className="p-4 pt-2 border-t border-dashed border-neutral-200 bg-neutral-50">
                                            {isLoading ? (
                                                <div className="flex items-center gap-2 text-sm text-neutral-400 italic py-2">
                                                    <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                                                    Loading spell description...
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {/* Metadata row inside expanded info */}
                                                    <div className="flex flex-wrap gap-6 py-2 border-b border-neutral-200">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-widest">Duration</span>
                                                            <span className="font-serif text-black uppercase">
                                                                {(() => {
                                                                    const system = fetched?.system || spell.system || {};
                                                                    const val = system.duration?.value;
                                                                    const type = system.duration?.type || '-';
                                                                    if (val === undefined || val === null || val === '' || val === -1) return type.charAt(0).toUpperCase() + type.slice(1);
                                                                    return `${val} ${type.charAt(0).toUpperCase() + type.slice(1)}${val !== 1 ? 's' : ''}`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-widest">Range</span>
                                                            <span className="font-serif text-black uppercase">{(fetched?.system || spell.system)?.range || 'Close'}</span>
                                                        </div>
                                                    </div>

                                                    <div className="text-sm font-serif leading-relaxed text-neutral-800 prose prose-sm max-w-none">
                                                        {description ? (
                                                            <div dangerouslySetInnerHTML={{ __html: formatDescription(description) }} />
                                                        ) : (
                                                            <span className="italic text-neutral-400">No description available.</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {filteredSpells.length === 0 && (
                            <div className="text-center py-20 text-neutral-400 italic border-2 border-dashed border-neutral-200 rounded-lg">
                                No spells found matching your filter.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-200 border-t-2 border-black flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 border-2 border-black font-serif font-bold text-lg hover:bg-neutral-300 transition-all active:translate-y-[2px]"
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-10 py-3 bg-black text-white border-2 border-black font-serif font-bold text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Check className="w-5 h-5" />
                        SAVE CHANGES
                    </button>
                </div>
            </div>
        </div>
    );
}
