
import React from 'react';

interface Props {
    requiredTalents: number;
    rolledTalents: any[];
    needsBoon: boolean;
    startingBoons: number;
    rolledBoons: any[];
    loading: boolean;
    onRollTalent: () => void;
    onRollBoon: () => void;
    onClearTalents: () => void;
}

export const TalentBoonSection = ({
    requiredTalents,
    rolledTalents,
    needsBoon,
    startingBoons,
    rolledBoons,
    loading,
    onRollTalent,
    onRollBoon,
    onClearTalents
}: Props) => {
    return (
        <div className="space-y-6">
            {requiredTalents > 0 && (
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden p-4">
                    <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-white rotate-45"></span>
                            <span>Class Talents</span>
                        </div>
                        <div className="text-xs font-black bg-white text-black px-2 py-0.5 rounded-sm">
                            {rolledTalents.length} / {requiredTalents}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 mb-4">
                        {rolledTalents.map((t, i) => (
                            <div key={i} className="bg-neutral-50 border-2 border-black p-3 flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                                <div className="bg-black text-white w-6 h-6 flex items-center justify-center font-bold text-xs">
                                    {i + 1}
                                </div>
                                <span className="font-serif font-black uppercase text-sm tracking-wide">{t.name}</span>
                            </div>
                        ))}
                        {rolledTalents.length === 0 && (
                            <div className="text-neutral-400 font-bold uppercase tracking-widest text-[10px] py-4 text-center border-2 border-dashed border-neutral-200">
                                No talents rolled yet
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRollTalent}
                            disabled={loading || rolledTalents.length >= (requiredTalents || 0)}
                            className="flex-1 bg-black text-white font-black py-2 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                            Roll Talent
                        </button>
                        {rolledTalents.length > 0 && (
                            <button
                                onClick={onClearTalents}
                                className="p-2 border-2 border-black hover:bg-red-50 text-black hover:text-red-700 transition-colors"
                                title="Clear results"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {needsBoon && (
                <div className="bg-purple-50 border-2 border-purple-900 shadow-[4px_4px_0px_0px_rgba(88,28,135,1)] relative overflow-hidden p-4">
                    <div className="bg-purple-900 text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-purple-300">✧</span>
                            <span>Divinity Boons</span>
                        </div>
                        {startingBoons > 0 && (
                            <div className="text-xs font-black bg-white text-purple-900 px-2 py-0.5 rounded-sm">
                                {rolledBoons.length} / {startingBoons}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 mb-4">
                        {rolledBoons.map((b, i) => (
                            <div key={i} className="bg-white border-2 border-purple-900 p-3 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-200">
                                <div className="bg-purple-900 text-white w-6 h-6 flex items-center justify-center font-bold text-xs ring-1 ring-purple-300">
                                    {i + 1}
                                </div>
                                <span className="font-serif font-black uppercase text-sm tracking-wide text-purple-950">{b.name}</span>
                            </div>
                        ))}
                        {rolledBoons.length === 0 && (
                            <div className="text-purple-300 font-bold uppercase tracking-widest text-[10px] py-4 text-center border-2 border-dashed border-purple-200">
                                No boons granted yet
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onRollBoon}
                        disabled={loading || (startingBoons > 0 && rolledBoons.length >= startingBoons) || (!rolledTalents.length && requiredTalents > 0 && rolledBoons.length > 0)}
                        className="w-full bg-purple-900 text-white font-black py-2 hover:bg-purple-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(88,28,135,1)] uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Seek Reward from Patron
                    </button>
                    {rollingBoonHelpText && (
                        <p className="mt-2 text-[10px] text-purple-700 font-bold text-center uppercase tracking-widest opacity-60">
                            * Granted by your Patron
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

const rollingBoonHelpText = true;
