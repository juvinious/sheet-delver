import { Shield } from 'lucide-react';

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
        <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header Bar */}
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center overflow-hidden">
                <div className="flex items-center gap-2">
                    <Shield size={18} className="text-white" />
                    <span>Armor Mastery</span>
                </div>
                <div className="text-xs font-black bg-white text-black px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                    {selected.length} / {required}
                </div>
            </div>

            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-[0.2em] mb-4 border-b-2 border-dashed border-neutral-100 pb-2">
                Select {required} armor type{required > 1 ? 's' : ''} to master
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ARMOR_TYPES.map(armor => {
                    const isSelected = selected.includes(armor);
                    const isDisabled = !isSelected && selected.length >= required;

                    return (
                        <button
                            key={armor}
                            onClick={() => toggleArmor(armor)}
                            disabled={isDisabled}
                            className={`
                                relative p-3 border-2 transition-all text-center group font-bold uppercase tracking-wider text-xs
                                ${isSelected
                                    ? 'bg-black text-white border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                    : isDisabled
                                        ? 'bg-neutral-50 border-neutral-200 text-neutral-300 cursor-not-allowed opacity-50'
                                        : 'bg-white border-black hover:bg-neutral-100 text-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                }
                            `}
                        >
                            {armor}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
