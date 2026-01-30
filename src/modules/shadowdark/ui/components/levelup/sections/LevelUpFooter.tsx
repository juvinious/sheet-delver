
import React from 'react';

interface Props {
    onCancel: () => void;
    onConfirm: () => void;
    isComplete: boolean;
    loading: boolean;
}

export const LevelUpFooter = ({ onCancel, onConfirm, isComplete, loading }: Props) => {
    return (
        <div className="bg-neutral-100 border-t-4 border-black p-6 flex justify-between items-center">
            <button
                onClick={onCancel}
                className="bg-white text-black font-serif font-black text-lg uppercase tracking-[0.2em] px-8 py-3 border-4 border-black hover:bg-neutral-100 hover:text-red-700 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
                Cancel
            </button>

            <button
                onClick={onConfirm}
                disabled={!isComplete || loading}
                className={`
                    px-8 py-3 font-serif font-black text-lg uppercase tracking-[0.2em] transition-all
                    flex items-center gap-3
                    ${isComplete && !loading
                        ? 'bg-black text-white hover:bg-neutral-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
                        : 'bg-neutral-200 text-neutral-400 border-2 border-neutral-300 pointer-events-none'}
                `}
            >
                Finalize Level Up
            </button>
        </div>
    );
};
