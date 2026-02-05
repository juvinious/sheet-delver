
'use client';

import { useState } from 'react';
import { logger } from '@/app/ui/logger';

interface ShadowdarkImportModalProps {
    onClose: () => void;
    onImportSuccess: (id: string) => void;
    token: string | null;
}

interface ImportError {
    type: string;
    name: string;
    error: string;
}

import { createPortal } from 'react-dom';

export default function ShadowdarkImportModal({ onClose, onImportSuccess, token }: ShadowdarkImportModalProps) {
    const [jsonInput, setJsonInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rawErrors, setRawErrors] = useState<ImportError[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [importedId, setImportedId] = useState<string | null>(null);
    const [charSummary, setCharSummary] = useState<any>(null);

    const handleCancel = async () => {
        if (importedId) {
            // Delete the actor if we cancel after creating it
            try {
                const headers: any = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                await fetch(`/api/actors/${importedId}`, { method: 'DELETE', headers });
            } catch (e) {
                logger.error("Failed to cleanup actor", e);
            }
        }
        onClose();
    };

    const handleImport = async () => {
        if (!jsonInput.trim()) return;

        setLoading(true);
        setError(null);
        setRawErrors([]);
        setWarnings([]);
        setCharSummary(null);

        try {
            let parsed;
            try {
                parsed = JSON.parse(jsonInput);
                // Extract summary data
                setCharSummary({
                    name: parsed.name || 'Unnamed',
                    ancestry: parsed.ancestry || 'Unknown',
                    class: parsed.class || 'Unknown',
                    level: parsed.level || 1,
                    hp: parsed.maxHitPoints || 0,
                    gp: parsed.gold || 0,
                    xp: parsed.XP || 0
                });
            } catch {
                throw new Error("Invalid JSON format");
            }

            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/modules/shadowdark/import', {
                method: 'POST',
                headers,
                body: JSON.stringify(parsed)
            });

            const data = await res.json();
            logger.debug('[Import Modal] API Response:', data);

            if (data.debug && Array.isArray(data.debug)) {
                data.debug.forEach((log: string) => logger.debug(`[Importer] ${log}`));
            }

            if (!res.ok) {
                throw new Error(data.error || 'Import failed');
            }

            if (data.errors && data.errors.length > 0) {
                // Filter and store objects. If string, wrap it.
                const objs = data.errors.map((e: any) =>
                    typeof e === 'string' ? { type: 'General', name: e, error: '' } : e
                );
                setRawErrors(objs);
            }

            if (data.warnings && Array.isArray(data.warnings)) {
                setWarnings(data.warnings);
            }

            if (data.success && data.id) {
                // If there are no HARD errors (warnings are ok), auto-proceed.
                if (!data.errors || data.errors.length === 0) {
                    onImportSuccess(data.id);
                    return;
                }

                // Otherwise show the results (with errors)
                setImportedId(data.id);
            }

        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 h-full w-full">
            <div className={`bg-stone-200 text-neutral-900 border-4 border-double border-neutral-800 rounded-lg shadow-2xl max-w-xl w-full flex flex-col max-h-[90vh] font-serif transition-all ${importedId ? 'scale-100' : 'scale-100'}`}>

                {/* Header */}
                <div className="p-4 flex justify-center items-center border-b-2 border-neutral-800 bg-stone-300">
                    <h2 className="text-3xl font-black uppercase tracking-wider text-neutral-900 drop-shadow-sm font-crimson">Shadowdarkling Importer</h2>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto bg-stone-200">

                    {/* View: Input */}
                    {!importedId && (
                        <>
                            <div className="mb-4">
                                <p className="text-neutral-700 font-bold mb-2 uppercase text-sm tracking-wide">Paste JSON Export:</p>
                                <textarea
                                    value={jsonInput}
                                    onChange={(e) => setJsonInput(e.target.value)}
                                    className="w-full h-64 bg-white border-2 border-neutral-400 p-4 text-xs font-mono text-neutral-800 focus:outline-none focus:border-neutral-900 shadow-inner resize-none rounded-none"
                                    placeholder='{ "name": "Character Name", ... }'
                                    disabled={loading}
                                />
                            </div>
                            {error && (
                                <div className="p-3 mb-4 bg-red-100 border border-red-500 text-red-900 text-sm font-bold">
                                    ERROR: {error}
                                </div>
                            )}
                        </>
                    )}

                    {/* View: Summary / Result */}
                    {importedId && charSummary && (
                        <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">

                            {/* Character Card */}
                            <div className="border-2 border-neutral-900 bg-stone-100 p-4 shadow-sm relative overflow-hidden">
                                {/* Name Banner */}
                                <div className="bg-neutral-900 text-white px-2 py-1 inline-block absolute top-0 left-0">
                                    <span className="font-bold uppercase tracking-widest text-lg ml-2">{charSummary.name}</span>
                                </div>

                                <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-1 text-sm font-bold text-neutral-800">
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>Ancestry:</span>
                                        <span>{charSummary.ancestry}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>HP:</span>
                                        <span>{charSummary.hp} / {charSummary.hp}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>Class:</span>
                                        <span>{charSummary.class}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>GP:</span>
                                        <span>{charSummary.gp}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>Level:</span>
                                        <span>{charSummary.level}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-300 pb-1">
                                        <span>XP:</span>
                                        <span>{charSummary.xp}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Warnings / Notifications */}
                            {warnings.length > 0 && (
                                <div className="border-2 border-yellow-700 bg-yellow-50">
                                    <div className="bg-yellow-600 text-yellow-950 font-bold text-center uppercase py-1 text-sm tracking-widest relative">
                                        Import Notes
                                    </div>
                                    <div className="max-h-32 overflow-y-auto p-2">
                                        <ul className="list-disc list-inside text-sm text-yellow-900">
                                            {warnings.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Warnings Table */}
                            {rawErrors.length > 0 && (
                                <div className="border-2 border-neutral-900 bg-white">
                                    <div className="bg-black text-white font-bold text-center uppercase py-1 text-sm tracking-widest relative">
                                        {/* Texture hint if desired */}
                                        Items Not Found
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead className="bg-stone-300 text-neutral-900 font-bold border-b-2 border-neutral-900">
                                                <tr>
                                                    <th className="p-2 border-r border-neutral-400">Item Name</th>
                                                    <th className="p-2">Item Type</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rawErrors.map((err, i) => (
                                                    <tr key={i} className="border-b border-stone-200 even:bg-stone-50">
                                                        <td className="p-2 border-r border-stone-200 font-semibold">{err.name}</td>
                                                        <td className="p-2 text-neutral-600">{err.type}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 border-t-2 border-neutral-800 bg-stone-300 flex justify-center gap-4">
                    <button
                        onClick={handleCancel}
                        className="px-6 py-2 rounded-sm border-2 border-neutral-500 text-neutral-600 hover:text-neutral-900 hover:border-neutral-900 font-bold uppercase transition-all"
                    >
                        Cancel
                    </button>

                    {importedId ? (
                        <button
                            onClick={() => onImportSuccess(importedId)}
                            className="px-8 py-2 rounded-sm bg-neutral-200 border-2 border-neutral-900 hover:bg-white text-neutral-900 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none transition-all uppercase tracking-wide flex items-center gap-2"
                        >
                            Continue to Sheet
                        </button>
                    ) : (
                        <button
                            onClick={handleImport}
                            disabled={loading || !jsonInput}
                            className="px-8 py-2 rounded-sm bg-neutral-800 border-2 border-neutral-900 hover:bg-neutral-700 text-white font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] hover:shadow-lg transition-all uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Reading Scroll...' : 'Import Character'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    // Use Portal to escape stacking contexts
    if (typeof document === 'undefined') return null;
    return createPortal(modalContent, document.body);
}
