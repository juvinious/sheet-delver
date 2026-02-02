'use client';

import { useState } from 'react';
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

    const addTerm = (term: string) => {
        setFormula(prev => {
            // If empty, start with /r 
            const newFormula = prev || '/r ';
            // Simple check to avoid double spaces or weird joins
            const spacer = newFormula.endsWith(' ') ? '' : ' + ';
            return newFormula + spacer + term;
        });
    };

    const handleManualChange = (val: string) => {
        setFormula(val);
    };

    const clear = () => setFormula('');

    const roll = () => {
        if (!formula) return;
        // Apply adv/dis logic if not manually present?
        // For simplicity, we just send what's in the box, but user might expect buttons to handle it.
        // If adv/dis is selected, we might want to wrap d20s? 
        // The requested UI separates them. Let's just send the formula string.
        let finalFormula = formula;

        // Basic ADV/DIS handling if the user just clicked "d20" and "ADV"
        if (advMode === 'adv' && finalFormula.includes('1d20')) {
            finalFormula = finalFormula.replace(/1d20/g, '2d20kh');
        } else if (advMode === 'dis' && finalFormula.includes('1d20')) {
            finalFormula = finalFormula.replace(/1d20/g, '2d20kl');
        }

        onSend(finalFormula);
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
