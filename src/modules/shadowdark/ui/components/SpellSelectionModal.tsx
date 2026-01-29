
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, Info } from 'lucide-react';
import { resolveImage } from '../sheet-utils';

interface SpellOption {
    name: string;
    uuid: string;
    img?: string;
    tier: number;
    class?: string[];
    description?: string;
}

interface SpellSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (selected: SpellOption[]) => void;
    title: string;
    availableSpells: SpellOption[];
    knownSpells: SpellOption[];
    foundryUrl?: string;
    maxSelections?: number;
}

export default function SpellSelectionModal({
    isOpen,
    onClose,
    onSave,
    title,
    availableSpells,
    knownSpells,
    foundryUrl,
    maxSelections
}: SpellSelectionModalProps) {
    const [search, setSearch] = useState('');
    // Store selected UUIDs
    const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
    const [previewSpell, setPreviewSpell] = useState<SpellOption | null>(null);
    const [loadingDescription, setLoadingDescription] = useState(false);

    // Fetch description when preview changes if missing
    useEffect(() => {
        const loadDescription = async () => {
            if (previewSpell && (!previewSpell.description || previewSpell.description === '')) {
                setLoadingDescription(true);
                try {
                    const res = await fetch(`/api/foundry/document?uuid=${encodeURIComponent(previewSpell.uuid)}`);
                    if (res.ok) {
                        const doc = await res.json();
                        // We assume description is in system.description.value usually for Foundry
                        // But sometimes it's directly in system.description (Shadowdark template?) or just description
                        let desc = doc.system?.description?.value || doc.system?.description || doc.description || '';

                        // If it's an object but empty value
                        if (typeof desc === 'object' && desc !== null) {
                            desc = desc.value || '';
                        }

                        if (!desc) desc = 'No description available.';

                        setPreviewSpell(prev => prev && prev.uuid === doc.uuid ? { ...prev, description: desc } : prev);
                    }
                } catch (e) {
                    console.error("Failed to fetch description", e);
                }
                setLoadingDescription(false);
            }
        };

        loadDescription();
    }, [previewSpell]);

    // Initialize selection from known spells
    useEffect(() => {
        if (isOpen) {
            const initialSet = new Set<string>();
            // We match by Name usually if UUIDs differ, but ideally UUIDs match.
            // Known spells from Actor might be "Item.xyz" (embedded) vs "Compendium.abc" (source).
            // We should rely on Name matching if UUID lookup fails, or if we track sourceId.
            // For now, let's try to match by Name since compendium data is consistent.

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
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [availableSpells, search]);

    const toggleSpell = (uuid: string) => {
        const newSet = new Set(selectedUuids);
        if (newSet.has(uuid)) {
            newSet.delete(uuid);
        } else {
            if (maxSelections && newSet.size >= maxSelections) return; // Prevent selection if full
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

    // Sort spells alphabetically
    const sortedSpells = [...availableSpells].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                className="bg-neutral-100 w-full max-w-4xl max-h-[90vh] rounded-lg shadow-2xl overflow-hidden flex flex-col border border-neutral-800"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-neutral-900 text-white p-4 flex justify-between items-center border-b-4 border-amber-600">
                    <div>
                        <h2 className="text-xl font-serif font-bold tracking-wider">{title}</h2>
                        <p className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
                            <span className={isMaxReached ? "text-amber-500 font-bold" : ""}>
                                Selected: <span className="text-white">{selectedUuids.size}</span>
                                {maxSelections !== undefined && (
                                    <> / <span className={selectedUuids.size > maxSelections ? "text-red-500" : "text-white"}>{maxSelections}</span></>
                                )}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Search */}
                    <div className="mb-6 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Filter spells..."
                            className="w-full pl-10 pr-4 py-3 bg-white border border-neutral-300 rounded shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all text-lg"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {/* Spell Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {sortedSpells.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).map(spell => {
                            const isSelected = selectedUuids.has(spell.uuid);
                            // Disabled if: Strict max reached AND this one is NOT selected
                            const disabled = !isSelected && isMaxReached;

                            return (
                                <button
                                    key={spell.uuid}
                                    onClick={() => toggleSpell(spell.uuid)}
                                    disabled={disabled}
                                    className={`
                                        group relative p-3 rounded-lg border text-left transition-all flex items-center justify-between
                                        ${isSelected
                                            ? 'bg-amber-100 border-amber-600 shadow-md ring-1 ring-amber-500'
                                            : 'bg-white border-neutral-200 hover:border-black hover:shadow-sm'
                                        }
                                        ${disabled ? 'opacity-40 grayscale cursor-not-allowed hover:border-neutral-200' : ''}
                                    `}
                                    title={spell.name}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {/* Optional: Tiny icon if available */}
                                        {foundryUrl && spell.img && (
                                            <img
                                                src={resolveImage(spell.img, foundryUrl)}
                                                alt=""
                                                className="w-8 h-8 rounded border border-neutral-300 object-cover bg-black"
                                            />
                                        )}
                                        <span className={`font-bold text-sm truncate ${isSelected ? 'text-neutral-900' : 'text-neutral-700'}`}>
                                            {spell.name}
                                        </span>
                                    </div>

                                    {isSelected && (
                                        <div className="bg-amber-600 text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                                            <Check className="w-3.5 h-3.5" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {sortedSpells.length === 0 && (
                        <div className="text-center py-12 text-neutral-500 italic">
                            No spells available for this tier.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-200 border-t border-neutral-300 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-neutral-600 font-bold hover:text-black hover:bg-neutral-300 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 py-2 bg-amber-600 text-white font-bold rounded shadow-lg hover:bg-amber-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
