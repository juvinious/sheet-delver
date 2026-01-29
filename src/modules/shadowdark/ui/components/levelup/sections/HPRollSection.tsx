
import React from 'react';

interface Props {
    hpRoll: number;
    confirmReroll: boolean;
    loading: boolean;
    onRoll: (isReroll: boolean) => void;
    onClear: () => void;
    setConfirmReroll: (confirm: boolean) => void;
}

export const HPRollSection = ({
    hpRoll,
    confirmReroll,
    loading,
    onRoll,
    onClear,
    setConfirmReroll
}: Props) => {
    return (
        <div className="bg-white p-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                <span>Hit Points</span>
                {hpRoll > 0 && (
                    <button
                        onClick={onClear}
                        className="p-1 hover:bg-white/20 text-white/50 hover:text-white transition-colors"
                        title="Clear Roll"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-6 p-2">
                <div className={`text-5xl font-black font-serif ${hpRoll > 0 ? 'text-black' : 'text-neutral-300'}`}>
                    {hpRoll || '--'}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                    {hpRoll === 0 ? (
                        <button
                            onClick={() => onRoll(false)}
                            disabled={loading}
                            className="w-full bg-black text-white font-black py-3 px-4 hover:bg-neutral-800 disabled:opacity-50 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest"
                        >
                            Roll for HP
                        </button>
                    ) : (
                        !confirmReroll ? (
                            <button
                                onClick={() => setConfirmReroll(true)}
                                className="text-neutral-500 hover:text-black text-xs font-bold flex items-center gap-1 uppercase tracking-widest transition-colors w-max"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Re-roll HP
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                <span className="text-[10px] font-black uppercase text-red-600">Sure?</span>
                                <button onClick={() => onRoll(true)} className="bg-red-600 text-white font-bold text-xs px-3 py-1 hover:bg-red-700">YES</button>
                                <button onClick={() => setConfirmReroll(false)} className="bg-neutral-200 text-neutral-600 font-bold text-xs px-3 py-1 hover:bg-neutral-300">NO</button>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};
