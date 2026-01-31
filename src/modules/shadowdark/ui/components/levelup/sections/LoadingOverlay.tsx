import React from 'react';

export const LoadingOverlay = () => {
    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-neutral-900/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-4 max-w-sm text-center">
                <div className="w-16 h-16 border-4 border-black border-t-amber-500 rounded-full animate-spin"></div>
                <div>
                    <h3 className="font-serif font-black text-2xl uppercase tracking-widest text-black">
                        Consulting the Omens...
                    </h3>
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mt-2">
                        Gathering class secrets and forbidden lore
                    </p>
                </div>
            </div>
        </div>
    );
};
