
import React from 'react';
import { useConfig } from '@/app/ui/context/ConfigContext';

interface Props {
    pendingChoices: {
        header: string;
        options: any[];
        context: 'talent' | 'boon';
    };
    onSelect: (choice: any) => void;
}

export const SelectionOverlay = ({ pendingChoices, onSelect }: Props) => {
    const { resolveImageUrl } = useConfig();
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-neutral-900/90 backdrop-blur-sm"></div>
            <div className="relative w-full max-w-lg bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="bg-black px-6 py-4 flex items-center justify-between border-b-2 border-white">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest font-serif">
                        {pendingChoices.header}
                    </h2>
                    <div className="text-white/20">
                        <svg className="w-6 h-6 rotate-45" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                </div>

                <div className="p-6">
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4 border-l-4 border-neutral-200 pl-3">
                        Divine fate has presented a choice. Select your destiny:
                    </p>

                    <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {pendingChoices.options.map((choice, idx) => {
                            let imgSrc = resolveImageUrl(choice.img || "icons/dice-d20.svg");

                            // Fix specific known bad asset
                            if (imgSrc.includes('d20-black.svg')) imgSrc = "/icons/dice-d20.svg";

                            // RollTable specific handling
                            if (choice.type === 'RollTable' || choice.documentCollection === 'RollTable') {
                                if (!choice.img || choice.img === 'icons/svg/d20.svg') {
                                    imgSrc = "/icons/dice-d20.svg";
                                }
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => onSelect(choice)}
                                    className="group flex items-center gap-4 bg-white hover:bg-neutral-50 p-4 border-2 border-black hover:border-black transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-left"
                                >
                                    <div className="relative w-12 h-12 flex-shrink-0 bg-black border-2 border-black overflow-hidden shadow-inner">
                                        <img
                                            src={imgSrc}
                                            alt={choice.name}
                                            className={`w-full h-full object-cover group-hover:scale-110 transition-all duration-300 ${imgSrc.includes('dice-d20') ? 'invert' : ''}`}
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                // Prevent infinite loop if default also fails
                                                if (target.src.includes('dice-d20.svg')) return;
                                                target.src = "/icons/dice-d20.svg";
                                                target.style.filter = "invert(1)";
                                            }}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-serif font-black text-lg uppercase leading-none text-black group-hover:underline">
                                            {choice.name}
                                        </div>
                                        {choice.original?.description && (
                                            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight line-clamp-1 mt-1">
                                                {choice.original.description.replace(/<[^>]+>/g, '')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white p-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
