
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
    theme?: {
        overlay?: string;
        container?: string;
        header?: string;
        title?: string;
        body?: string;
        inputGroup?: string;
        label?: string;
        input?: string;
        footer?: string;
        rollBtn?: (mode: 'normal' | 'adv' | 'dis') => string;
        closeBtn?: string;
        select?: string;
        selectArrow?: string;
    };
}

const defaultTheme = {
    overlay: "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity",
    container: "w-full max-w-md relative z-10 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 animate-in zoom-in-95 duration-200",
    header: "mb-6 border-b border-black/5 pb-3",
    title: "font-sans text-2xl font-bold tracking-tight text-center text-neutral-900",
    body: "space-y-4 mb-8",
    inputGroup: "grid grid-cols-3 items-center gap-4",
    label: "col-span-1 font-bold text-xs uppercase tracking-widest text-neutral-400",
    input: "col-span-2 p-2 bg-white/50 border border-neutral-200 rounded-xl font-sans text-lg outline-none focus:border-neutral-900 transition-all text-neutral-900",
    footer: "flex flex-col gap-3",
    rollBtn: (mode: 'normal' | 'adv' | 'dis') => {
        const base = "flex-1 py-3 px-4 font-bold text-sm rounded-xl transition-all active:scale-95 shadow-sm ";
        if (mode === 'normal') return base + "bg-neutral-900 text-white hover:bg-black";
        if (mode === 'adv') return base + "bg-green-500/10 text-green-700 hover:bg-green-500/20";
        return base + "bg-red-500/10 text-red-700 hover:bg-red-500/20";
    },
    closeBtn: "text-neutral-500 hover:text-white transition-colors",
    select: "w-full p-2 bg-white/50 border border-neutral-200 rounded-xl font-sans text-lg outline-none appearance-none cursor-pointer hover:border-neutral-400 transition-all text-neutral-900",
    selectArrow: "absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400"
};

export default function RollDialog({ isOpen, title, type, defaults, onConfirm, onClose, theme }: RollDialogProps) {
    const [abilityBonus, setAbilityBonus] = useState(0);
    const [itemBonus, setItemBonus] = useState(0);
    const [talentBonus, setTalentBonus] = useState(0);
    const [rollingMode, setRollingMode] = useState<string>('publicroll');
    const popupRef = useRef<HTMLDivElement>(null);

    const t = { ...defaultTheme, ...theme };

    // Reset state when dialog opens with new defaults
    useEffect(() => {
        if (isOpen) {
            setAbilityBonus(defaults?.abilityBonus || 0);
            setItemBonus(defaults?.itemBonus || 0);
            setTalentBonus(defaults?.talentBonus || 0);

            // Persistence: Load roll mode
            const saved = localStorage.getItem('sheetdelver_roll_mode');
            if (saved) setRollingMode(saved);
        }
    }, [isOpen, defaults]);

    // Persistence: Save roll mode
    const updateRollMode = (mode: string) => {
        setRollingMode(mode);
        localStorage.setItem('sheetdelver_roll_mode', mode);
    };

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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Overlay background - absolute to parent fixed wrapper */}
            <div
                className={t.overlay}
                onClick={onClose}
            />

            <div
                ref={popupRef}
                className={t.container}
            >
                {/* Main Content */}
                <div className={t.header + (theme?.header ? "" : " flex justify-between items-center")}>
                    <h2 className={t.title}>{title}</h2>
                    <button
                        onClick={onClose}
                        className={t.closeBtn}
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                    </button>
                </div>

                <div className={t.body}>
                    {/* Dynamic Inputs based on Type */}
                    {(type === 'attack' || type === 'spell') && (defaults?.showItemBonus !== false) && (
                        <div className={t.inputGroup}>
                            <label className={t.label}>Item Bonus</label>
                            <input
                                type="number"
                                value={itemBonus}
                                onChange={e => setItemBonus(Number(e.target.value))}
                                className={t.input}
                            />
                        </div>
                    )}

                    <div className={t.inputGroup}>
                        <label className={t.label}>Ability Bonus</label>
                        <input
                            type="number"
                            value={abilityBonus}
                            onChange={e => setAbilityBonus(Number(e.target.value))}
                            className={t.input}
                        />
                    </div>

                    {(type === 'attack' || type === 'spell') && (
                        <div className={t.inputGroup}>
                            <label className={t.label}>Talent Bonus</label>
                            <input
                                type="number"
                                value={talentBonus}
                                onChange={e => setTalentBonus(Number(e.target.value))}
                                className={t.input}
                            />
                        </div>
                    )}

                    <div className={`${t.inputGroup} pt-4 border-t border-black/5`}>
                        <label className={t.label}>Mode</label>
                        <div className="col-span-2 relative">
                            <select
                                value={rollingMode}
                                onChange={e => updateRollMode(e.target.value)}
                                className={t.select}
                            >
                                <option value="publicroll">Public Roll</option>
                                <option value="gmroll">Private GM Roll</option>
                                <option value="blindroll">Blind GM Roll</option>
                                <option value="selfroll">Self Roll</option>
                            </select>
                            <div className={t.selectArrow}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className={t.footer}>
                    <button
                        onClick={() => handleRoll('normal')}
                        className={t.rollBtn ? t.rollBtn('normal') : defaultTheme.rollBtn('normal')}
                    >
                        Roll Normal
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleRoll('advantage')}
                            className={t.rollBtn ? t.rollBtn('adv') : defaultTheme.rollBtn('adv')}
                        >
                            Advantage
                        </button>
                        <button
                            onClick={() => handleRoll('disadvantage')}
                            className={t.rollBtn ? t.rollBtn('dis') : defaultTheme.rollBtn('dis')}
                        >
                            Disadvantage
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

