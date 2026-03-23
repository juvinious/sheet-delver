import React from 'react';
import { Theme } from '../hooks/useTheme';

interface WorldClosedViewProps {
    system: any;
    appVersion: string;
    theme: Theme;
}

/**
 * Displayed when the Foundry world is running but the service account cannot connect.
 * Shows world info (title, description) identical to the LoginView info card,
 * but without the login form. Lets the user know the service is retrying.
 */
export const WorldClosedView = ({ system, appVersion, theme }: WorldClosedViewProps) => {
    return (
        <div className="flex flex-col-reverse md:flex-row gap-8 max-w-4xl mx-auto items-stretch md:items-start animate-in fade-in slide-in-from-bottom-4 duration-500 mt-10">
            {/* World Info Card — mirrors the LoginView left panel */}
            <div className={`flex-1 ${theme.panelBg} p-6 rounded-lg shadow-lg border border-white/5`}>
                {system?.worldTitle && (
                    <h1 className={`text-4xl font-bold mb-4 ${theme.headerFont} text-amber-500 tracking-tight`}>
                        {system.worldTitle}
                    </h1>
                )}

                {system?.worldDescription && (
                    <div
                        className="prose prose-invert prose-sm max-w-none opacity-80 mb-6"
                        dangerouslySetInnerHTML={{ __html: system.worldDescription }}
                    />
                )}

                <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-white/10">
                    <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-1">Next Session</label>
                        <div className="font-mono text-lg">
                            {system?.nextSession
                                ? system.nextSession
                                : <span className="opacity-30 italic">Not Scheduled</span>}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs uppercase tracking-widest opacity-50 block mb-1">Total Players</label>
                        <div className="font-mono text-lg">
                            {system?.users?.total ?? 0}
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Panel — shown in place of the login form */}
            <div className={`w-full md:w-96 ${theme.panelBg} p-6 rounded-lg shadow-lg border border-white/5 flex flex-col items-center justify-center text-center gap-4`}>
                {/* Pulsing indicator */}
                <div className="relative flex items-center justify-center w-14 h-14">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-20 animate-ping" />
                    <span className="relative inline-flex rounded-full h-8 w-8 bg-amber-500/40 items-center justify-center">
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-9a3 3 0 100-6 3 3 0 000 6z" />
                        </svg>
                    </span>
                </div>

                <h2 className={`text-xl font-bold ${theme.headerFont} text-amber-400`}>Service Unavailable</h2>

                <p className="text-sm opacity-60 leading-relaxed">
                    The world is running, but the service account cannot connect.
                    Please check the helper account configuration.
                </p>

                <p className="text-xs font-mono opacity-30 mt-2">Retrying automatically...</p>

                {appVersion && (
                    <p className="text-xs font-mono opacity-20 mt-auto">v{appVersion}</p>
                )}
            </div>
        </div>
    );
};
