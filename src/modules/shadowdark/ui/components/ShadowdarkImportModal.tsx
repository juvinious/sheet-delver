
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 h-full w-full animate-in fade-in duration-300">
            <div className={`bg-neutral-50 border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] max-w-xl w-full flex flex-col max-h-[90vh] font-serif transition-all ${importedId ? 'scale-100' : 'scale-100'} animate-in zoom-in-95 duration-300`}>

                {/* Header */}
                <div className="bg-black p-6 flex justify-center items-center border-b-4 border-neutral-900">
                    <h2 className="text-3xl font-black uppercase tracking-widest text-white font-serif drop-shadow-md">Shadowdarkling Importer</h2>
                </div>

                {/* Content */}
                <div className="p-8 flex-1 overflow-y-auto bg-neutral-100">

                    {/* View: Input */}
                    {!importedId && (
                        <>
                            <div className="mb-6">
                                <p className="text-neutral-900 font-black mb-2 uppercase text-sm tracking-widest font-serif">Paste JSON Export</p>
                                <textarea
                                    value={jsonInput}
                                    onChange={(e) => setJsonInput(e.target.value)}
                                    className="w-full h-64 bg-white border-2 border-neutral-300 p-4 text-xs font-mono text-neutral-900 focus:outline-none focus:border-black focus:ring-1 focus:ring-black shadow-inner resize-none transition-all"
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
                        <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300">

                            {/* Character Card */}
                            <div className="border-2 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] relative overflow-hidden group hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] transition-all">
                                {/* Name Banner */}
                                <div className="bg-black text-white px-6 py-2 inline-block absolute top-0 left-0 border-r-4 border-b-4 border-white shadow-sm z-10">
                                    <span className="font-black uppercase tracking-widest text-xl font-serif">{charSummary.name}</span>
                                </div>

                                <div className="mt-12 grid grid-cols-2 gap-x-8 gap-y-2 text-sm font-bold text-neutral-900">
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">Ancestry</span>
                                        <span className="font-serif text-lg">{charSummary.ancestry}</span>
                                    </div>
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">HP</span>
                                        <span className="font-serif text-lg">{charSummary.hp} / {charSummary.hp}</span>
                                    </div>
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">Class</span>
                                        <span className="font-serif text-lg">{charSummary.class}</span>
                                    </div>
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">GP</span>
                                        <span className="font-serif text-lg">{charSummary.gp}</span>
                                    </div>
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">Level</span>
                                        <span className="font-serif text-lg">{charSummary.level}</span>
                                    </div>
                                    <div className="flex justify-between border-b-2 border-neutral-100 pb-1">
                                        <span className="text-neutral-500 uppercase tracking-wider text-xs">XP</span>
                                        <span className="font-serif text-lg">{charSummary.xp}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Warnings / Notifications */}
                            {warnings.length > 0 && (
                                <div className="border-2 border-amber-500 bg-amber-50">
                                    <div className="bg-amber-500 text-white font-black text-center uppercase py-1 text-sm tracking-widest relative">
                                        Import Notes
                                    </div>
                                    <div className="max-h-32 overflow-y-auto p-4">
                                        <ul className="list-disc list-inside text-sm text-amber-900 font-medium">
                                            {warnings.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Warnings Table */}
                            {rawErrors.length > 0 && (
                                <div className="border-2 border-red-500 bg-red-50">
                                    <div className="bg-red-500 text-white font-black text-center uppercase py-1 text-sm tracking-widest relative">
                                        Items Not Found
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-sm text-left border-collapse">
                                            <thead className="bg-red-100 text-red-900 font-bold border-b-2 border-red-200">
                                                <tr>
                                                    <th className="p-2 border-r border-red-200">Item Name</th>
                                                    <th className="p-2">Item Type</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rawErrors.map((err, i) => (
                                                    <tr key={i} className="border-b border-red-100 even:bg-red-50/50">
                                                        <td className="p-2 border-r border-red-100 font-semibold text-red-900">{err.name}</td>
                                                        <td className="p-2 text-red-700">{err.type}</td>
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
                <div className="p-6 border-t-4 border-black bg-neutral-100 flex justify-center gap-6">
                    <button
                        onClick={handleCancel}
                        className="px-8 py-3 rounded-none border-2 border-neutral-300 text-neutral-500 hover:text-black hover:border-black font-bold uppercase tracking-widest transition-all"
                    >
                        Cancel
                    </button>

                    {importedId ? (
                        <button
                            onClick={() => onImportSuccess(importedId)}
                            className="px-10 py-3 rounded-none bg-black text-white hover:bg-neutral-900 font-black shadow-lg hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all uppercase tracking-widest flex items-center gap-2"
                        >
                            Continue to Sheet
                        </button>
                    ) : (
                        <button
                            onClick={handleImport}
                            disabled={loading || !jsonInput}
                            className="px-10 py-3 rounded-none bg-amber-600 hover:bg-amber-500 text-white font-black shadow-lg hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-none transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transform"
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
