'use client';

import { useState, useEffect } from 'react';
import { SystemAdapter } from '@/modules/core/interfaces';

interface DiceTrayProps {
    onSend: (message: string) => void;
    adapter?: SystemAdapter;
}

const defaultStyles = {
    container: "bg-slate-800 rounded-lg border border-slate-700 p-4 flex flex-col gap-4 h-full",
    header: "text-slate-400 text-sm font-bold uppercase border-b border-slate-700 pb-2",
    textarea: "w-full h-24 bg-slate-900 border border-slate-700 rounded p-3 font-mono text-lg text-amber-500 focus:border-amber-500 outline-none resize-none",
    clearBtn: "absolute top-2 right-2 text-xs text-slate-500 hover:text-red-400 uppercase font-bold",
    diceRow: "flex flex-wrap justify-between gap-2 bg-slate-900/50 p-2 rounded border border-slate-800",
    diceBtn: "w-10 h-10 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded shadow border border-slate-600 text-xs font-bold font-mono transition-colors",
    modGroup: "flex gap-1",
    modBtn: "px-3 py-2 bg-slate-700 rounded hover:bg-slate-600 font-bold border border-slate-600",
    advGroup: "flex bg-slate-900 rounded border border-slate-700 p-1",
    advBtn: (active: boolean, type: 'normal' | 'adv' | 'dis') => {
        if (!active) return "px-2 py-1 text-xs font-bold rounded text-slate-500 hover:text-slate-300";
        if (type === 'normal') return "px-2 py-1 text-xs font-bold rounded bg-slate-600 text-white";
        if (type === 'adv') return "px-2 py-1 text-xs font-bold rounded bg-green-600 text-white";
        return "px-2 py-1 text-xs font-bold rounded bg-red-600 text-white";
    },
    sendBtn: "flex-1 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-wider py-3 rounded shadow-lg active:translate-y-0.5 transition-all text-xl",
    helpText: "text-xs text-slate-500 text-center mt-2"
};

export default function DiceTray({ onSend, adapter }: DiceTrayProps) {
    const [formula, setFormula] = useState('');
    const [advMode, setAdvMode] = useState<'normal' | 'adv' | 'dis'>('normal');

    const s = { ...defaultStyles, ...(adapter?.componentStyles?.diceTray || {}) };

    // --- Reactive Formula Logic ---

    // Constants for regex
    // Matches 1d20, 2d20kh, 2d20kl, 1d4, 2d4kh, etc.
    const DICE_REGEX = /(\d+)d(\d+)([a-z]*)/g;

    const updateFormulaForMode = (currentFormula: string, mode: 'normal' | 'adv' | 'dis') => {
        if (!currentFormula) return currentFormula;

        return currentFormula.replace(DICE_REGEX, (match, count, faces, suffix) => {
            const facesInt = parseInt(faces);

            // Only apply to d20? User said "1d4... advantage... /r 2d4kh".
            // So applies to ALL dice.

            if (mode === 'normal') {
                // Revert to 1dX if it looks like an advantage roll (2dXkh/kl)
                // Heuristic: If count is 2 and suffix is kh/kl, revert to 1.
                // Or simply strip modifiers and reset count? 
                // "1d4" -> "2d4kh" -> "1d4"
                if (count === '2' && (suffix === 'kh' || suffix === 'kl')) {
                    return `1d${faces}`;
                }
                // If it was already 1d4, leave it.
                // If user typed 3d6 manually, we shouldn't touch it unless it fits our pattern.
                return match;
            }

            if (mode === 'adv') {
                // 1d4 -> 2d4kh
                // 2d4kl -> 2d4kh
                if (count === '1' && !suffix) {
                    return `2d${faces}kh`;
                }
                if (count === '2' && suffix === 'kl') {
                    return `2d${faces}kh`; // Switch from dis to adv
                }
                return match;
            }

            if (mode === 'dis') {
                // 1d4 -> 2d4kl
                // 2d4kh -> 2d4kl
                if (count === '1' && !suffix) {
                    return `2d${faces}kl`;
                }
                if (count === '2' && suffix === 'kh') {
                    return `2d${faces}kl`; // Switch from adv to dis
                }
                return match;
            }

            return match;
        });
    };

    // Effect: Update formula when advMode changes
    useEffect(() => {
        setFormula(prev => updateFormulaForMode(prev, advMode));
    }, [advMode]);

    const addTerm = (term: string) => {
        // Prepare terms based on mode
        let finalTerm = term;
        // Check if term is a die (e.g. "1d20")
        if (term.match(/^\d+d\d+$/)) {
            // Let the helper transform it immediately
            finalTerm = updateFormulaForMode(term, advMode);
        }

        setFormula(prev => {
            // If empty, start with /r 
            const newFormula = prev || '/r ';
            // Simple check to avoid double spaces or weird joins
            const spacer = newFormula.endsWith(' ') ? '' : ' + ';
            return newFormula + spacer + finalTerm;
        });
    };

    const handleManualChange = (val: string) => {
        setFormula(val);
    };

    const clear = () => setFormula('');

    const roll = () => {
        if (!formula) return;
        // Formula is already reactive, so just send it.
        onSend(formula);
        setFormula('');
        setAdvMode('normal');
    };

    return (
        <div className={s.container}>
            <h3 className={s.header}>Dice Tray</h3>

            {/* Display / Input */}
            <div className="relative">
                <textarea
                    value={formula}
                    onChange={(e) => handleManualChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            roll();
                        }
                    }}
                    className={s.textarea || defaultStyles.textarea}
                    placeholder="/r 1d20 + 5 OR Hello World"
                />
                <button
                    onClick={clear}
                    className={s.clearBtn || defaultStyles.clearBtn}
                >
                    Clear
                </button>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 gap-4">

                {/* Dice Row */}
                <div className={s.diceRow || defaultStyles.diceRow}>
                    {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(d => (
                        <button
                            key={d}
                            onClick={() => addTerm('1' + d)}
                            className={s.diceBtn || defaultStyles.diceBtn}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                {/* Modifiers & Roll */}
                <div className="flex gap-2 items-center">
                    <div className={s.modGroup || defaultStyles.modGroup}>
                        <button onClick={() => addTerm('1')} className={s.modBtn || defaultStyles.modBtn}>+1</button>
                        <button onClick={() => addTerm('5')} className={s.modBtn || defaultStyles.modBtn}>+5</button>
                        <button onClick={() => addTerm('-1')} className={s.modBtn || defaultStyles.modBtn}>-1</button>
                    </div>

                    <div className={s.advGroup || defaultStyles.advGroup}>
                        <button
                            onClick={() => setAdvMode('normal')}
                            className={s.advBtn ? s.advBtn(advMode === 'normal', 'normal') : defaultStyles.advBtn(advMode === 'normal', 'normal')}
                        >
                            -
                        </button>
                        <button
                            onClick={() => setAdvMode('adv')}
                            className={s.advBtn ? s.advBtn(advMode === 'adv', 'adv') : defaultStyles.advBtn(advMode === 'adv', 'adv')}
                        >
                            ADV
                        </button>
                        <button
                            onClick={() => setAdvMode('dis')}
                            className={s.advBtn ? s.advBtn(advMode === 'dis', 'dis') : defaultStyles.advBtn(advMode === 'dis', 'dis')}
                        >
                            DIS
                        </button>
                    </div>

                    <button
                        onClick={roll}
                        className={s.sendBtn || defaultStyles.sendBtn}
                    >
                        Send
                    </button>
                </div>
            </div>

            <div className={s.helpText || defaultStyles.helpText}>
                Click dice to append. Edit manually if needed. ADV/DIS applies to d20s.
            </div>
        </div>
    );
}
