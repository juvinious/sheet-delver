
import React, { useState, useEffect } from 'react';

interface RollDialogProps {
    isOpen: boolean;
    title: string;
    type: 'attack' | 'ability' | 'spell';
    defaults?: {
        abilityBonus?: number;
        itemBonus?: number;
        talentBonus?: number;
    };
    onConfirm: (options: any) => void;
    onClose: () => void;
}

export default function RollDialog({ isOpen, title, type, defaults, onConfirm, onClose }: RollDialogProps) {
    const [abilityBonus, setAbilityBonus] = useState(0);
    const [itemBonus, setItemBonus] = useState(0);
    const [talentBonus, setTalentBonus] = useState(0);
    const [rollingMode, setRollingMode] = useState('public');

    // Reset state when dialog opens with new defaults
    useEffect(() => {
        if (isOpen) {
            setAbilityBonus(defaults?.abilityBonus || 0);
            setItemBonus(defaults?.itemBonus || 0);
            setTalentBonus(defaults?.talentBonus || 0);
            setRollingMode('public');
        }
    }, [isOpen, defaults]);

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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#EAE5D9] w-full max-w-md shadow-2xl rounded border border-neutral-400 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-[#2C2C2C] text-white px-4 py-2 flex justify-between items-center bg-[url('/header-texture.png')]">
                    <h3 className="font-serif font-bold text-lg">{title}</h3>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <span className="sr-only">Close</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        <span className="ml-1 text-sm font-sans">Close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 font-sans text-neutral-800">
                    <h2 className="font-sans text-2xl font-bold mb-4 border-b border-neutral-300 pb-2">{title}</h2>

                    <div className="space-y-3 mb-6">
                        {/* Dynamic Inputs based on Type */}
                        {(type === 'attack' || type === 'spell') && (
                            <div className="grid grid-cols-3 items-center gap-4">
                                <label className="col-span-1 font-bold text-sm">Item Bonus</label>
                                <input
                                    type="number"
                                    value={itemBonus}
                                    onChange={e => setItemBonus(Number(e.target.value))}
                                    className="col-span-2 p-1 border border-neutral-300 rounded bg-[#F5F2EB] focus:ring-1 focus:ring-neutral-500 outline-none"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-3 items-center gap-4">
                            <label className="col-span-1 font-bold text-sm">Ability Bonus</label>
                            <input
                                type="number"
                                value={abilityBonus}
                                onChange={e => setAbilityBonus(Number(e.target.value))}
                                className="col-span-2 p-1 border border-neutral-300 rounded bg-[#F5F2EB] focus:ring-1 focus:ring-neutral-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-3 items-center gap-4">
                            <label className="col-span-1 font-bold text-sm">Talent Bonus</label>
                            <input
                                type="number"
                                value={talentBonus}
                                onChange={e => setTalentBonus(Number(e.target.value))}
                                className="col-span-2 p-1 border border-neutral-300 rounded bg-[#F5F2EB] focus:ring-1 focus:ring-neutral-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-3 items-center gap-4 pt-2 border-t border-neutral-200">
                            <label className="col-span-1 font-bold text-sm">Rolling Mode</label>
                            <select
                                value={rollingMode}
                                onChange={e => setRollingMode(e.target.value)}
                                className="col-span-2 p-1 border border-neutral-300 rounded bg-[#F5F2EB] focus:ring-1 focus:ring-neutral-500 outline-none"
                            >
                                <option value="public">Public Roll</option>
                                <option value="private">Private GM Roll</option>
                                <option value="blind">Blind GM Roll</option>
                                <option value="self">Self Roll</option>
                            </select>
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex gap-2 pt-4 border-t border-neutral-300">
                        <button
                            onClick={() => handleRoll('advantage')}
                            className="flex-1 py-2 px-4 bg-[#D6D3CB] border border-neutral-400 rounded hover:bg-[#C4C1B9] transition-colors text-sm font-bold shadow-sm"
                        >
                            Advantage
                        </button>
                        <button
                            onClick={() => handleRoll('normal')}
                            className="flex-1 py-2 px-4 bg-[#D6D3CB] border border-neutral-400 rounded hover:bg-[#C4C1B9] transition-colors text-sm font-bold shadow-sm ring-2 ring-red-400 ring-opacity-50"
                        >
                            Normal
                        </button>
                        <button
                            onClick={() => handleRoll('disadvantage')}
                            className="flex-1 py-2 px-4 bg-[#D6D3CB] border border-neutral-400 rounded hover:bg-[#C4C1B9] transition-colors text-sm font-bold shadow-sm"
                        >
                            Disadvantage
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
