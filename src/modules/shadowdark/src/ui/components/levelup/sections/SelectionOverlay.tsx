import React, { useState } from 'react';
import { useConfig } from '@/app/ui/context/ConfigContext';

interface Props {
    pendingChoices: {
        header: string;
        options: any[];
        context: 'talent' | 'boon';
        maxSelections?: number;
    };
    onSelect: (choice: any | any[]) => void;
    onClose: () => void;
}

export const SelectionOverlay = ({ pendingChoices, onSelect, onClose }: Props) => {
    const { resolveImageUrl } = useConfig();
    const maxSelections = pendingChoices.maxSelections || 1;
    const [selected, setSelected] = useState<any[]>([]);

    const handleItemClick = (choice: any) => {
        if (maxSelections === 1) {
            onSelect(choice);
            return;
        }

        setSelected(prev => {
            const isSelected = prev.some(p => p._id === choice._id);
            if (isSelected) {
                return prev.filter(p => p._id !== choice._id);
            } else {
                if (prev.length >= maxSelections) return prev;
                return [...prev, choice];
            }
        });
    };

    const handleConfirm = () => {
        if (selected.length === maxSelections) {
            onSelect(selected);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-lg bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
                <div className="bg-black px-6 py-4 flex items-center justify-between border-b-2 border-white shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest font-serif">
                        {pendingChoices.header}
                    </h2>
                    {maxSelections > 1 && (
                        <div className="text-white text-xs font-bold bg-neutral-800 px-2 py-1 rounded">
                            Select {maxSelections}
                        </div>
                    )}
                </div>

                <div className="p-6 overflow-hidden flex flex-col min-h-0">
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4 border-l-4 border-neutral-200 pl-3 shrink-0">
                        {maxSelections > 1
                            ? `Choose carefully. You must select exactly ${maxSelections} options.`
                            : "Divine fate has presented a choice. Select your destiny:"}
                    </p>

                    <div className="grid grid-cols-1 gap-3 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                        {pendingChoices.options.map((choice, idx) => {
                            let imgSrc = resolveImageUrl(choice.img || "icons/dice-d20.svg");
                            if (imgSrc.includes('d20-black.svg')) imgSrc = "/icons/dice-d20.svg";
                            if (choice.type === 'RollTable' || choice.documentCollection === 'RollTable') {
                                if (!choice.img || choice.img === 'icons/svg/d20.svg') {
                                    imgSrc = "/icons/dice-d20.svg";
                                }
                            }

                            const isSelected = selected.some(s => s._id === choice._id);
                            const isDisabled = maxSelections > 1 && !isSelected && selected.length >= maxSelections;

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleItemClick(choice)}
                                    disabled={isDisabled}
                                    className={`group flex items-center gap-4 p-2 border-2 text-left transition-all
                                        ${isSelected
                                            ? 'bg-neutral-100 border-black ring-1 ring-black translate-x-[2px] translate-y-[2px]'
                                            : 'bg-white border-neutral-200 hover:border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'}
                                        ${isDisabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}
                                    `}
                                >
                                    <div className="relative w-10 h-10 flex-shrink-0 bg-black border border-black overflow-hidden">
                                        <img
                                            src={imgSrc}
                                            alt={choice.name}
                                            className={`w-full h-full object-cover transition-all duration-300 ${imgSrc.includes('dice-d20') ? 'invert' : ''}`}
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                if (target.src.includes('dice-d20.svg')) return;
                                                target.src = "/icons/dice-d20.svg";
                                                target.style.filter = "invert(1)";
                                            }}
                                        />
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif font-bold text-sm uppercase leading-tight text-black truncate">
                                            {choice.name}
                                        </div>
                                        {choice.original?.description && (
                                            <div className="text-[9px] font-bold text-neutral-500 uppercase tracking-tight line-clamp-1 mt-0.5">
                                                {choice.original.description.replace(/<[^>]+>/g, '')}
                                            </div>
                                        )}
                                    </div>
                                    {maxSelections === 1 && (
                                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white p-1">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-neutral-100 p-4 border-t-2 border-black shrink-0 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-white hover:bg-neutral-50 font-serif font-black uppercase tracking-widest text-sm px-6 py-3 border-2 border-black transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-1px]"
                    >
                        Cancel
                    </button>
                    {maxSelections > 1 && (
                        <button
                            onClick={handleConfirm}
                            disabled={selected.length !== maxSelections}
                            className={`flex-1 font-serif font-black uppercase tracking-widest text-sm px-6 py-3 border-2 border-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                                ${selected.length === maxSelections
                                    ? 'bg-black text-white hover:bg-neutral-800 hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
                                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed shadow-none border-neutral-300'}
                            `}
                        >
                            Confirm ({selected.length}/{maxSelections})
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
