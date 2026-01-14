
import React, { useState, useEffect, useRef } from 'react';

interface RollDialogProps {
    isOpen: boolean;
    title: string;
    type: 'attack' | 'ability' | 'spell';
    defaults?: {
        abilityBonus?: number;
        itemBonus?: number;
        talentBonus?: number;
        showItemBonus?: boolean;
    };
    onConfirm: (options: any) => void;
    onClose: () => void;
}

export default function RollDialog({ isOpen, title, type, defaults, onConfirm, onClose }: RollDialogProps) {
    const [abilityBonus, setAbilityBonus] = useState(0);
    const [itemBonus, setItemBonus] = useState(0);
    const [talentBonus, setTalentBonus] = useState(0);
    const [rollingMode, setRollingMode] = useState('public');
    const popupRef = useRef<HTMLDivElement>(null);

    // Reset state when dialog opens with new defaults
    useEffect(() => {
        if (isOpen) {
            setAbilityBonus(defaults?.abilityBonus || 0);
            setItemBonus(defaults?.itemBonus || 0);
            setTalentBonus(defaults?.talentBonus || 0);
            setRollingMode('public');
        }
    }, [isOpen, defaults]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleRoll = (advantageMode: 'normal' | 'advantage' | 'disadvantage') => {
        onConfirm({
            abilityBonus,
            itemBonus,
            talentBonus,
            rollingMode,
            advantageMode
        });
    };

    const buttonClass = "flex-1 py-3 px-4 uppercase font-bold text-sm border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none font-serif tracking-wider";
    const normalBtn = `${buttonClass} bg-white text-black hover:bg-neutral-100`;
    const actionBtn = `${buttonClass} bg-black text-white hover:bg-neutral-800`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
                ref={popupRef}
                className="w-full max-w-md relative animate-in zoom-in-95 duration-200"
            >
                {/* Floating Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 z-10 bg-black text-white w-8 h-8 rounded-full border-2 border-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                </button>

                {/* Main Card */}
                <div className="bg-white border-2 border-black p-6 shadow-2xl">
                    <h2 className="font-serif text-2xl font-bold mb-6 border-b-2 border-black pb-2 uppercase tracking-wide text-center">{title}</h2>

                    <div className="space-y-4 mb-8">
                        {/* Dynamic Inputs based on Type */}
                        {(type === 'attack' || type === 'spell') && (defaults?.showItemBonus !== false) && (
                            <div className="grid grid-cols-3 items-center gap-4">
                                <label className="col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-500">Item Bonus</label>
                                <input
                                    type="number"
                                    value={itemBonus}
                                    onChange={e => setItemBonus(Number(e.target.value))}
                                    className="col-span-2 p-2 border-2 border-black font-serif text-lg outline-none focus:bg-neutral-50 transition-colors"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-3 items-center gap-4">
                            <label className="col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-500">Ability Bonus</label>
                            <input
                                type="number"
                                value={abilityBonus}
                                onChange={e => setAbilityBonus(Number(e.target.value))}
                                className="col-span-2 p-2 border-2 border-black font-serif text-lg outline-none focus:bg-neutral-50 transition-colors"
                            />
                        </div>

                        {(type === 'attack' || type === 'spell') && (
                            <div className="grid grid-cols-3 items-center gap-4">
                                <label className="col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-500">Talent Bonus</label>
                                <input
                                    type="number"
                                    value={talentBonus}
                                    onChange={e => setTalentBonus(Number(e.target.value))}
                                    className="col-span-2 p-2 border-2 border-black font-serif text-lg outline-none focus:bg-neutral-50 transition-colors"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-3 items-center gap-4 pt-4 border-t-2 border-dashed border-neutral-300">
                            <label className="col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-500">Mode</label>
                            <div className="col-span-2 relative">
                                <select
                                    value={rollingMode}
                                    onChange={e => setRollingMode(e.target.value)}
                                    className="w-full p-2 border-2 border-black font-serif text-lg outline-none appearance-none bg-white cursor-pointer hover:bg-neutral-50 transition-colors"
                                >
                                    <option value="public">Public Roll</option>
                                    <option value="private">Private GM Roll</option>
                                    <option value="blind">Blind GM Roll</option>
                                    <option value="self">Self Roll</option>
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-black">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => handleRoll('normal')}
                            className={actionBtn}
                        >
                            Roll Normal
                        </button>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleRoll('advantage')}
                                className={`${normalBtn} text-green-700 hover:bg-green-50`}
                            >
                                Advantage
                            </button>
                            <button
                                onClick={() => handleRoll('disadvantage')}
                                className={`${normalBtn} text-red-700 hover:bg-red-50`}
                            >
                                Disadvantage
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

