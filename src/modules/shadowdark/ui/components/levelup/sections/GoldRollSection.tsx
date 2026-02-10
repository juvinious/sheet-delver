import { useState } from 'react';
import { SectionStatus } from '../useLevelUp';

interface Props {
    goldRoll: number | null;
    goldFormula: string;
    goldMax: number;
    status: SectionStatus;
    onRoll: (isReroll: boolean) => void;
    onManualChange: (val: number | null) => void;
    onClear: () => void;
}

export const GoldRollSection = ({
    goldRoll,
    goldFormula,
    goldMax,
    status,
    onRoll,
    onManualChange,
    onClear
}: Props) => {
    const [isManual, setIsManual] = useState(false);

    const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val)) {
            const constrained = Math.min(Math.max(val, 0), goldMax);
            onManualChange(constrained);
        } else if (e.target.value === '') {
            onManualChange(null);
        }
    };

    return (
        <div className="bg-white p-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden h-full flex flex-col">
            <div className="bg-black text-white px-4 py-2 font-serif font-bold text-lg uppercase tracking-wider -mx-4 -mt-4 mb-4 flex justify-between items-center h-12">
                <span>Gold</span>
                {goldRoll !== null && goldRoll > 0 && (
                    <button
                        onClick={onClear}
                        className="text-white/50 hover:text-white transition-colors"
                        title="Clear Roll"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-center py-4">
                    <div className={`text-6xl font-black font-serif ${goldRoll !== null && goldRoll > 0 ? 'text-black' : 'text-neutral-200'} flex items-center`}>
                        {isManual ? (
                            <input
                                type="number"
                                value={goldRoll || ''}
                                onChange={handleManualInput}
                                className="w-32 bg-neutral-100 border-b-4 border-black text-center focus:outline-none appearance-none p-2"
                                placeholder="-"
                                min={0}
                                max={goldMax}
                            />
                        ) : (
                            <>
                                {goldRoll || '--'}
                                <span className="text-2xl text-neutral-400 font-bold ml-2 self-end mb-2">gp</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    {!isManual && (
                        <div className="text-center text-neutral-400 font-bold uppercase tracking-widest text-xs">
                            {goldFormula}
                        </div>
                    )}

                    <div className="flex gap-2">
                        {!isManual ? (
                            goldRoll === null || goldRoll === 0 ? (
                                <button
                                    onClick={() => onRoll(false)}
                                    disabled={status === 'LOADING' || status === 'DISABLED'}
                                    className="flex-1 bg-black text-white font-black py-3 px-4 hover:bg-neutral-800 disabled:opacity-50 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-widest text-lg"
                                >
                                    Roll
                                </button>
                            ) : (
                                <button
                                    onClick={() => onRoll(true)}
                                    className="flex-1 bg-white text-black font-bold py-3 px-4 border-2 border-black hover:bg-neutral-50 transition-all uppercase tracking-widest text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                >
                                    Re-roll
                                </button>
                            )
                        ) : (
                            <div className="h-12 w-full"></div>
                        )}
                        {(!isManual && goldRoll !== null && goldRoll > 0) && <div className="hidden"></div>}

                        <button
                            onClick={() => setIsManual(!isManual)}
                            className="w-12 flex items-center justify-center border-2 border-neutral-200 hover:border-black text-neutral-400 hover:text-black transition-colors rounded bg-white shadow-sm"
                            title="Toggle Manual Entry"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <style jsx>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
            `}</style>
        </div>
    );
};
