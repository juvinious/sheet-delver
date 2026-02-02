'use client';

import { useState, useEffect } from 'react';
import { resolveImage } from './sheet-utils';
import { ConfirmationModal } from '@/app/ui/components/ConfirmationModal';

interface EffectsTabProps {
    actor: any;
    foundryUrl?: string;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
}

export default function EffectsTab({ actor, foundryUrl, onToggleEffect, onDeleteEffect }: EffectsTabProps) {
    const [predefinedEffects, setPredefinedEffects] = useState<any[]>([]);
    const [selectedEffect, setSelectedEffect] = useState<string>('');
    const [effectToDelete, setEffectToDelete] = useState<string | null>(null);

    // Fetch predefined effects list on mount
    useEffect(() => {
        const fetchPredefinedEffects = async () => {
            try {
                const res = await fetch(`/api/actors/${actor.id}/predefined-effects`);
                const data = await res.json();

                // Ensure we have a valid array
                if (data.effects && Array.isArray(data.effects)) {
                    setPredefinedEffects(data.effects);
                } else {
                    console.warn('Predefined effects API returned invalid format:', data);
                    setPredefinedEffects([]);
                }
            } catch (error) {
                console.error('Failed to fetch predefined effects:', error);
                setPredefinedEffects([]);
            }
        };

        if (actor?.id) {
            fetchPredefinedEffects();
        }
    }, [actor?.id]);
    // Separate effects into conditions (with statuses) and other effects
    const allEffects = (actor.effects || []).sort((a: any, b: any) => (a.name || a.label || '').localeCompare(b.name || b.label || ''));
    const conditions = allEffects.filter((e: any) => e.statuses && e.statuses.length > 0);
    const otherEffects = allEffects.filter((e: any) => !e.statuses || e.statuses.length === 0);

    const formatDuration = (effect: any) => {
        if (!effect.duration) return '∞';
        // If label is present and not an empty string or "None", use it
        if (effect.duration.label && effect.duration.label.trim() !== '' && effect.duration.label !== 'None') return effect.duration.label;

        const d = effect.duration;
        // Check numeric values
        if (d.rounds > 0) return `${d.rounds} rounds`;
        if (d.seconds > 0) return `${d.seconds}s`;
        if (d.turns > 0) return `${d.turns} turns`;

        // Default fallback if no specific duration is set
        return '∞';
    };

    const renderHeader = (title: string) => (
        <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider shadow-md">
            {title}
        </div>
    );

    const renderPassiveTable = (items: any[]) => {
        if (items.length === 0) return <div className="p-4 text-center text-neutral-500 italic border border-neutral-200">None</div>;

        return (
            <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-neutral-100 border-b border-black">
                    <tr>
                        <th className="p-2 font-serif font-bold uppercase">Effect</th>
                        <th className="p-2 font-serif font-bold uppercase w-1/3">Type</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((e: any, i) => (
                        <tr key={e._id || e.id || i} className="border-b border-neutral-200">
                            <td className="p-2 flex items-center gap-2">
                                <img src={resolveImage(e.img || e.icon, foundryUrl)} className="w-6 h-6 border border-neutral-400" alt="" />
                                <span className="font-bold">{e.name || e.label}</span>
                            </td>
                            <td className="p-2 text-neutral-600">
                                {e.isSuppressed ? 'Suppressed' : 'Passive'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const renderActiveTable = (items: any[]) => {
        if (items.length === 0) return <div className="p-4 text-center text-neutral-500 italic border border-neutral-200">None</div>;

        return (
            <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-neutral-100 border-b border-black">
                    <tr>
                        <th className="p-2 font-serif font-bold uppercase">Effect</th>
                        <th className="p-2 font-serif font-bold uppercase">Source</th>
                        <th className="p-2 font-serif font-bold uppercase">Duration</th>
                        <th className="p-2 font-serif font-bold uppercase w-24 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((e: any, i) => (
                        <tr key={e._id || e.id || i} className="border-b border-neutral-200">
                            <td className="p-2 flex items-center gap-2">
                                <img src={resolveImage(e.img || e.icon, foundryUrl)} className="w-6 h-6 border border-neutral-400" alt="" />
                                <span className="font-bold">{e.name || e.label}</span>
                            </td>
                            <td className="p-2 text-neutral-600">
                                {e.sourceName || 'Unknown'}
                            </td>
                            <td className={`p-2 ${formatDuration(e) === '∞' ? 'text-2xl leading-[0]' : ''}`}>
                                {formatDuration(e)}
                            </td>
                            <td className="p-2 flex justify-center gap-2">
                                {/* Toggle */}
                                <button
                                    onClick={() => onToggleEffect(e._id || e.id, !!e.disabled)}
                                    title={e.disabled ? "Enable Effect" : "Disable Effect"}
                                    className={`w-6 h-6 rounded flex items-center justify-center border ${!e.disabled ? 'bg-black text-white border-black' : 'bg-white text-neutral-300 border-neutral-300'}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                </button>
                                {/* Delete */}
                                <button
                                    onClick={() => setEffectToDelete(e._id || e.id)}
                                    title="Delete Effect"
                                    className="text-neutral-400 hover:text-red-600"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Effects and Conditions Section */}
            <div className="space-y-4">
                {renderHeader("Effects and Conditions")}

                <div className="grid grid-cols-1 md:grid-cols-1 gap-0 bg-transparent">
                    <div className="border-b-2 border-black pb-2">
                        <div className="flex justify-between items-center px-1 font-bold text-lg border-b border-black">
                            <span>Effect</span>
                            <span>Type</span>
                        </div>
                        {renderPassiveTable(otherEffects)}
                    </div>

                    <div className="pt-2">
                        <div className="flex justify-between items-center px-1 font-bold text-lg border-b border-black">
                            <span>Condition</span>
                            <span>Type</span>
                        </div>
                        {renderPassiveTable(conditions)}
                    </div>
                </div>
            </div>

            {/* Active Effects Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 bg-black text-white p-2 shadow-md">
                    <span className="font-serif font-bold text-xl uppercase tracking-wider">Active Effects</span>
                </div>

                {/* Pre-defined Effects Dropdown */}
                <div className="flex items-center gap-2 p-2 bg-transparent">
                    <span className="font-bold">Pre-defined Effects</span>
                    <select
                        value={selectedEffect}
                        onChange={(e) => setSelectedEffect(e.target.value)}
                        className="bg-white p-1 px-2 rounded border border-neutral-300 w-64 text-sm font-normal"
                    >
                        <option value="">Select an effect...</option>
                        {predefinedEffects.map((effect: any) => (
                            <option key={effect.id} value={effect.id}>
                                {effect.label || effect.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={async () => {
                            if (selectedEffect) {
                                try {
                                    const res = await fetch(`/api/actors/${actor.id}/predefined-effects`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ effectKey: selectedEffect })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        // Trigger a reload of the actor or optimistic update?
                                        // The parent ShadowdarkSheet handles updates via prop, but we just bypassed it.
                                        // We might need to trigger a refresh.
                                        // Since we don't have a 'refresh' prop, we rely on the Page's polling or we should add a refresh callback?
                                        // Actually, EffectsTab receives 'actor'. If we change it server side, we need to wait for polling.
                                        // BETTER: call onToggleEffect with a dummy to trigger update? No.
                                        // We'll just wait for polling or call a reload if available.
                                        // Ideally, we move this logic to a context or hook, but for now:

                                        // We can assume the page polls. 
                                        setSelectedEffect('');
                                    } else {
                                        console.error('Failed to add effect:', data.error);
                                    }
                                } catch (e) {
                                    console.error('Error adding effect:', e);
                                }
                            }
                        }}
                        disabled={!selectedEffect}
                        className="px-3 py-1 bg-black text-white rounded text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
                    >
                        Add
                    </button>
                </div>

                <div className="border border-black bg-white">
                    {renderActiveTable(allEffects)}
                </div>
            </div>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!effectToDelete}
                title="Delete Effect"
                message="Are you sure you want to remove this effect?"
                confirmLabel="Delete"
                onConfirm={() => {
                    if (effectToDelete && onDeleteEffect) {
                        onDeleteEffect(effectToDelete);
                        setEffectToDelete(null);
                    }
                }}
                onCancel={() => setEffectToDelete(null)}
            />
        </div>
    );
}
