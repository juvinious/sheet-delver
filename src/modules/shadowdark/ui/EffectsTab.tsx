'use client';

import { useState, useEffect } from 'react';
import { ConfirmationModal } from '@/app/ui/components/ConfirmationModal';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { logger } from '@/app/ui/logger';

interface EffectsTabProps {
    actor: any;
    token?: string | null;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onAddPredefinedEffect?: (effectId: string) => Promise<void>;
}

export default function EffectsTab({ actor, token, onToggleEffect, onDeleteEffect, onAddPredefinedEffect }: EffectsTabProps) {
    const { resolveImageUrl } = useConfig();
    const [predefinedEffects, setPredefinedEffects] = useState<any[]>([]);
    const [selectedEffect, setSelectedEffect] = useState<string>('');
    const [effectToDelete, setEffectToDelete] = useState<string | null>(null);

    // Fetch predefined effects list on mount
    useEffect(() => {
        const fetchPredefinedEffects = async () => {
            try {
                const headers: any = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch(`/api/modules/shadowdark/effects/predefined-effects`, { headers });
                const data = await res.json();

                if (data && Array.isArray(data)) {
                    setPredefinedEffects(data);
                }
            } catch (error) {
                console.error('Failed to fetch predefined effects:', error);
            }
        };

        if (actor?.id || actor?._id) {
            fetchPredefinedEffects();
        }
    }, [actor?.id, actor?._id, token]);

    // Single source of truth: the actor prop (now robustly merged in the adapter)
    const allEffects = [...(actor.effects || [])].sort((a: any, b: any) => (a.name || a.label || '').localeCompare(b.name || b.label || ''));
    const conditions = allEffects.filter((e: any) => e.statuses && e.statuses.length > 0);
    const otherEffects = allEffects.filter((e: any) => !e.statuses || e.statuses.length === 0);

    const formatDuration = (effect: any) => {
        if (!effect.duration) return '∞';
        if (effect.duration.label && effect.duration.label.trim() !== '' && effect.duration.label !== 'None') return effect.duration.label;

        const d = effect.duration;
        if (d.rounds > 0) return `${d.rounds} rounds`;
        if (d.seconds > 0) return `${d.seconds}s`;
        if (d.turns > 0) return `${d.turns} turns`;

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
                                <img src={resolveImageUrl(e.img || e.icon)} className="w-6 h-6 border border-neutral-400" alt="" />
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
                                <img src={resolveImageUrl(e.img || e.icon)} className="w-6 h-6 border border-neutral-400" alt="" />
                                <span className="font-bold">{e.name || e.label}</span>
                            </td>
                            <td className="p-2 text-neutral-600">
                                {e.sourceName || 'Unknown'}
                            </td>
                            <td className={`p-2 ${formatDuration(e) === '∞' ? 'text-2xl leading-[0]' : ''}`}>
                                {formatDuration(e)}
                            </td>
                            <td className="p-2 flex justify-center gap-2">
                                <button
                                    onClick={() => onToggleEffect(e._id || e.id, !!e.disabled)}
                                    title={e.disabled ? "Enable Effect" : "Disable Effect"}
                                    className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${!e.disabled ? 'bg-black text-white border-black' : 'bg-white text-neutral-300 border-neutral-300 hover:border-black'}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </button>
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

            <div className="space-y-4">
                <div className="flex items-center gap-2 bg-black text-white p-2 shadow-md">
                    <span className="font-serif font-bold text-xl uppercase tracking-wider">Active Effects</span>
                </div>

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
                            if (!selectedEffect) return;
                            try {
                                if (onAddPredefinedEffect) {
                                    await onAddPredefinedEffect(selectedEffect);
                                } else {
                                    const id = actor.id || actor._id;
                                    const headers: any = { 'Content-Type': 'application/json' };
                                    if (token) headers['Authorization'] = `Bearer ${token}`;
                                    await fetch(`/api/modules/shadowdark/actors/${id}/effects/toggle`, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify({ effectId: selectedEffect })
                                    });
                                }
                                setSelectedEffect('');
                            } catch (e) {
                                console.error('Failed to toggle effect:', e);
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
