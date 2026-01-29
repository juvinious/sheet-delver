
import React from 'react';

interface Props {
    goldRoll: number;
    loading: boolean;
    onRoll: () => void;
    onClear: () => void;
}

export const GoldRollSection = ({
    goldRoll,
    loading,
    onRoll,
    onClear
}: Props) => {
    return (
        <div className="bg-white p-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                <span>Gold Roll</span>
                {goldRoll > 0 && (
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

            <div className="flex items-center gap-4 p-2">
                <div className={`text-4xl font-black font-serif ${goldRoll > 0 ? 'text-black' : 'text-neutral-300'}`}>
                    {goldRoll || '--'}<span className="text-xl font-bold ml-1">gp</span>
                </div>
                <button
                    onClick={onRoll}
                    hidden={loading || goldRoll > 0}
                    className="flex-1 bg-black text-white font-black py-2 px-4 hover:bg-neutral-800 disabled:opacity-50 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-sm"
                >
                    Roll for Gold
                </button>
            </div>
            {/*<p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mt-2 px-2 text-center">
                * Starting Level 0 characters only
            </p>*/}
        </div>
    );
};
