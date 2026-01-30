
import React from 'react';

interface WeaponSelectionSectionProps {
    required: number;
    selected: string[];
    onSelectionChange: (selected: string[]) => void;
}

const WEAPONS = [
    "Dagger", "Staff", "Club", "Mace",
    "Shortsword", "Longsword", "Bastard Sword",
    "Greatsword", "Greataxe", "Warhammer",
    "Spear", "Javelin",
    "Shortbow", "Longbow", "Crossbow", "Sling"
];

export const WeaponSelectionSection: React.FC<WeaponSelectionSectionProps> = ({
    required,
    selected,
    onSelectionChange
}) => {
    if (required <= 0) return null;

    const toggleWeapon = (weapon: string) => {
        if (selected.includes(weapon)) {
            onSelectionChange(selected.filter(w => w !== weapon));
        } else {
            if (selected.length < required) {
                onSelectionChange([...selected, weapon]);
            }
        }
    };

    return (
        <div className="p-4 mb-4 border-2 border-yellow-600/50 bg-black/40 rounded-lg">
            <h3 className="text-xl font-bold text-yellow-500 mb-2 font-cinzel">
                Weapon Mastery Selection
            </h3>
            <p className="text-gray-400 mb-4 text-sm">
                Select {required} weapon type{required > 1 ? 's' : ''} to master.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WEAPONS.map(weapon => {
                    const isSelected = selected.includes(weapon);
                    const isDisabled = !isSelected && selected.length >= required;

                    return (
                        <button
                            key={weapon}
                            onClick={() => toggleWeapon(weapon)}
                            disabled={isDisabled}
                            className={`
                                p-2 text-sm border rounded transition-all duration-200
                                ${isSelected
                                    ? 'bg-yellow-900/50 border-yellow-500 text-yellow-100 shadow-[0_0_10px_rgba(234,179,8,0.3)]'
                                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                                }
                                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {weapon}
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
