import React, { useState } from 'react';
import ShadowdarkImportModal from './components/ShadowdarkImportModal';

interface ShadowdarkDashboardToolsProps {
    setLoading: (loading: boolean) => void;
    setLoginMessage: (msg: string) => void;
    theme: any;
}

export default function ShadowdarkDashboardTools({ setLoading, setLoginMessage, theme }: ShadowdarkDashboardToolsProps) {
    const [showImport, setShowImport] = useState(false);

    const handleImportSuccess = (id: string) => {
        setShowImport(false);
        // Maybe redirect to the new actor?
        window.location.href = `/actors/${id}`;
    };

    return (
        <div className={`p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/5 shadow-lg`}>
            <h3 className="text-sm font-bold opacity-50 uppercase tracking-widest mb-3">Tools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                    onClick={() => {
                        setLoading(true);
                        setLoginMessage('Loading Character Generator...');
                        setTimeout(() => {
                            window.location.href = '/tools/shadowdark/generator';
                        }, 500);
                    }}
                    className={`px-4 py-4 rounded-lg font-bold ${theme.button} text-white shadow-xl hover:-translate-y-0.5 hover:shadow-2xl flex items-center justify-center gap-2 transition-all duration-300 w-full border border-white/10`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .75c.75-.436 1.611-.877 2.45-1.125a20.086 20.086 0 003.856.096A9.736 9.736 0 0012 17.585a9.716 9.716 0 002.444.698 20.007 20.007 0 003.856-.096c.839.248 1.7.69 2.45 1.125a.75.75 0 001-.75V5.009a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3.75c-1.63 0-3.19.467-4.5 1.25-.386-.231-.795-.44-1.213-.623a9.778 9.778 0 00-1.037-.344zM12 16.03a8.232 8.232 0 01-1.5.178 8.22 8.22 0 01-1.346-.11A18.57 18.57 0 016 16.29V5.4a8.258 8.258 0 014.5 1.127.75.75 0 001.077-.375A8.25 8.25 0 0112 5.25v10.78zm1.5-10.78a8.258 8.258 0 013.423.852.75.75 0 001.077.375 8.258 8.258 0 014.5-1.127v10.89a18.57 18.57 0 01-3.154-.2 8.22 8.22 0 01-1.346.11 8.232 8.232 0 01-1.5-.178V5.25z" />
                    </svg>
                    Character Generator
                </button>

                <button
                    onClick={() => setShowImport(true)}
                    className={`px-4 py-4 rounded-lg font-bold bg-neutral-800/80 hover:bg-neutral-700/80 border border-white/10 text-white shadow-xl hover:-translate-y-0.5 hover:shadow-2xl flex items-center justify-center gap-2 transition-all duration-300 w-full`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    </svg>
                    Import From Shadowdarklings.net
                </button>
            </div>

            {showImport && (
                <ShadowdarkImportModal
                    onClose={() => setShowImport(false)}
                    onImportSuccess={handleImportSuccess}
                />
            )}
        </div>
    );
}
