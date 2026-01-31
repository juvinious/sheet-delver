import React from 'react';

interface LoadingModalProps {
    message: string;
    visible?: boolean;
}

export default function LoadingModal({ message, visible = true }: LoadingModalProps) {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="p-8 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl text-center space-y-4 max-w-sm w-full mx-4">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <h2 className="text-xl font-bold text-white font-sans">{message}</h2>
            </div>
        </div>
    );
}
