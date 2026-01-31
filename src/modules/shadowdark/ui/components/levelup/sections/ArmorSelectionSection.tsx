
import React from 'react';

interface ArmorSelectionSectionProps {
    required: number;
    selected: string[];
    onSelectionChange: (selected: string[]) => void;
}

const ARMOR_TYPES = [
    "Leather", "Chainmail", "Plate", "Shield"
];

export const ArmorSelectionSection: React.FC<ArmorSelectionSectionProps> = ({
    required,
    selected,
    onSelectionChange
}) => {
    if (required <= 0) return null;

    const toggleArmor = (armor: string) => {
        if (selected.includes(armor)) {
            onSelectionChange(selected.filter(a => a !== armor));
        } else {
            if (selected.length < required) {
                onSelectionChange([...selected, armor]);
            }
        }
    };

    return (
        <div className="p-4 mb-4 border-2 border-slate-600/50 bg-black/40 rounded-lg">
            <h3 className="text-xl font-bold text-slate-400 mb-2 font-cinzel">
                Armor Mastery Selection
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
                Select {required} armor type{required > 1 ? 's' : ''} to master.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ARMOR_TYPES.map(armor => {
                    const isSelected = selected.includes(armor);
                    const isDisabled = !isSelected && selected.length >= required;

                    return (
                        <button
                            key={armor}
                            onClick={() => toggleArmor(armor)}
                            disabled={isDisabled}
                            className={`
                                p-2 text-sm border rounded transition-all duration-200
                                ${isSelected
                                    ? 'bg-slate-800 border-slate-400 text-white shadow-[0_0_10px_rgba(148,163,184,0.3)]'
                                    : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                                }
                                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {armor}
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 text-right text-xs text-gray-500">
                {selected.length}/{required} Selected
            </div>
        </div>
    );
};
