import React from 'react';

interface SetupViewProps {
    appVersion: string;
}

export const SetupView = ({ appVersion }: SetupViewProps) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center p-8 space-y-6 animate-in fade-in duration-700">
            <h1 className={`text-6xl font-black tracking-tighter text-white mb-2 underline decoration-amber-500 underline-offset-8 decoration-4`} style={{ fontFamily: 'var(--font-cinzel), serif' }}>
                SheetDelver
            </h1>
            <p className="text-xs font-mono opacity-40 mb-8">v{appVersion || '...'}</p>

            <div className="bg-black/50 p-8 rounded-xl border border-white/10 backdrop-blur-md max-w-lg shadow-2xl w-full">
                <h2 className="text-2xl font-bold text-amber-500 mb-4">No World Available</h2>
                <p className="text-lg opacity-80 mb-6 leading-relaxed">
                    No world is available to login, please check back later.
                </p>

                <div className="flex justify-center gap-4">
                    <a
                        href="https://github.com/juvinious/sheet-delver"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-sm font-mono"
                    >
                        <img src="https://img.shields.io/badge/github-repo-blue?logo=github" alt="GitHub Repo" className="opacity-80" />
                    </a>
                </div>
            </div>
        </div>
    );
};
