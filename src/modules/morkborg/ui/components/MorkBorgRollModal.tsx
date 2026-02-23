'use client';

import { useEffect } from 'react';
import { IM_Fell_Double_Pica } from 'next/font/google';

const fell = IM_Fell_Double_Pica({ weight: '400', subsets: ['latin'] });

export interface MorkBorgRollConfig {
    title: string;        // e.g. "Ruthless Inquisition" or "Strength"
    rollLabel: string;    // e.g. "Tear Through" or "STR Test"
    formula: string;      // resolved formula: e.g. "1d20+4"
    humanFormula: string; // human-readable: e.g. "1d20 + 4 (Presence)"
    dr?: number;          // optional DR to display (e.g. 12 for scrolls)
    type: string;         // roll type to dispatch
    key: string;          // roll key to dispatch
    options?: any;        // any extra options
}

const ROLL_MODES = [
    { value: 'publicroll', label: 'Public' },
    { value: 'gmroll', label: 'GM Only' },
    { value: 'blindroll', label: 'Blind GM' },
    { value: 'selfroll', label: 'Self Only' },
];

interface MorkBorgRollModalProps {
    config: MorkBorgRollConfig;
    rollMode: string;
    onRollModeChange: (mode: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}

export default function MorkBorgRollModal({
    config,
    rollMode,
    onRollModeChange,
    onConfirm,
    onClose,
}: MorkBorgRollModalProps) {
    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-neutral-950 border-2 border-pink-900 shadow-[8px_8px_0_0_#831843] max-w-sm w-full p-6 relative -rotate-1"
                onClick={e => e.stopPropagation()}
            >
                {/* Skull corner decoration */}
                <div className="absolute -top-3 -right-3 text-2xl select-none">💀</div>

                {/* Title */}
                <h2 className={`${fell.className} text-2xl text-yellow-400 uppercase tracking-wide mb-1 leading-tight`}>
                    {config.title}
                </h2>
                <div className="text-pink-500 font-mono text-xs uppercase tracking-widest mb-5">
                    {config.rollLabel}
                </div>

                {/* Formula display */}
                <div className="bg-black border border-pink-900/40 p-3 mb-4 font-mono rotate-[0.5deg]">
                    <div className="text-neutral-500 text-[10px] uppercase tracking-widest mb-1">Formula</div>
                    <div className="text-white text-lg">{config.humanFormula}</div>
                    {config.dr !== undefined && (
                        <div className="text-neutral-400 text-xs mt-1">
                            vs <span className="text-yellow-400 font-bold">DR {config.dr}</span>
                        </div>
                    )}
                </div>

                {/* Roll Mode */}
                <div className="mb-5">
                    <div className="text-neutral-500 text-[10px] uppercase tracking-widest mb-2">Roll Mode</div>
                    <div className="grid grid-cols-4 gap-1">
                        {ROLL_MODES.map(m => (
                            <button
                                key={m.value}
                                onClick={() => onRollModeChange(m.value)}
                                className={`text-[10px] uppercase tracking-wider py-1 px-1 border transition-all font-mono cursor-pointer ${rollMode === m.value
                                        ? 'bg-pink-900 border-pink-500 text-white'
                                        : 'bg-black border-neutral-800 text-neutral-500 hover:border-pink-900 hover:text-neutral-300'
                                    }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onConfirm}
                        className={`${fell.className} flex-1 bg-pink-900 hover:bg-pink-700 text-white text-xl py-2 px-4 border border-pink-500 tracking-widest uppercase transition-colors shadow-[4px_4px_0_0_#000] cursor-pointer`}
                    >
                        Roll
                    </button>
                    <button
                        onClick={onClose}
                        className={`${fell.className} bg-black hover:bg-neutral-900 text-neutral-400 text-xl py-2 px-4 border border-neutral-700 tracking-widest uppercase transition-colors cursor-pointer`}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
