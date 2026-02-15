import React, { useState, useMemo, useEffect } from 'react';
import { X, Power, Search } from 'lucide-react';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { EFFECT_TRANSLATIONS_MAP } from '../../data/talent-effects';

interface AddEffectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate?: (effectData: any) => Promise<void>;
    onUpdate?: (effectData: any) => Promise<void>;
    initialData?: any;
    systemConfig?: any;
    predefinedEffects?: Record<string, any>;
}

const MODES = [
    { value: 2, label: 'ADD' },
    { value: 1, label: 'MULTIPLY' },
    { value: 5, label: 'OVERRIDE' },
    { value: 0, label: 'CUSTOM' },
    { value: 3, label: 'UPGRADE' },
    { value: 4, label: 'DOWNGRADE' },
];

export default function AddEffectsModal({
    isOpen,
    onClose,
    onCreate,
    onUpdate,
    initialData,
    systemConfig,
    predefinedEffects
}: AddEffectsModalProps) {
    const { resolveImageUrl } = useConfig();
    const [loading, setLoading] = useState(false);

    // Effect state
    const [effectKey, setEffectKey] = useState('');
    const [label, setLabel] = useState('');
    const [icon, setIcon] = useState('icons/svg/aura.svg');
    const [systemKey, setSystemKey] = useState('');
    const [value, setValue] = useState('1');
    const [mode, setMode] = useState(2);
    const [enabled, setEnabled] = useState(true);
    const [isCustom, setIsCustom] = useState(false);

    // Flatten predefined effects for dropdown
    const effectOptions = useMemo(() => {
        const effects = systemConfig?.PREDEFINED_EFFECTS || {};
        return Object.entries(effects).map(([key, val]: [string, any]) => ({
            key,
            label: val.label || val.name || key,
            icon: val.icon || 'icons/svg/aura.svg',
            effectKey: val.key || '',
            defaultValue: val.value,
            mode: val.mode || 2
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [systemConfig]);

    // Initialize from Initial Data (Edit Mode)
    useEffect(() => {
        if (initialData) {
            setLabel(initialData.name || initialData.label || '');
            setIcon(initialData.img || initialData.icon || 'icons/svg/aura.svg');
            setEnabled(!initialData.disabled);

            // Parse the first change (we're editing single-effect items)
            const changes = initialData.changes || [];
            if (changes.length > 0) {
                const change = changes[0];
                setSystemKey(change.key || '');
                setValue(change.value || '1');
                setMode(Number(change.mode ?? 2));

                // Try to match to a predefined effect
                const effectsMap = predefinedEffects || systemConfig?.PREDEFINED_EFFECTS || {};
                const found = Object.entries(effectsMap).find(([_key, conf]: any) =>
                    conf && conf.key === change.key
                );

                if (found) {
                    setEffectKey(found[0]);
                    setIsCustom(false);
                } else {
                    setEffectKey('custom');
                    setIsCustom(true);
                }
            }
        }
    }, [initialData, predefinedEffects, systemConfig]);

    if (!isOpen) return null;

    const handleSelectEffect = (key: string) => {
        if (!key) return;

        if (key === 'custom_custom_new') {
            // Custom Effect
            setEffectKey('custom');
            setIsCustom(true);
            setLabel('Custom Bonus');
            setIcon('icons/skills/melee/strike-axe-blood-red.webp');
            setSystemKey('');
            setValue('1');
            setMode(2);
            return;
        }

        const config = systemConfig?.PREDEFINED_EFFECTS?.[key];
        if (!config) return;

        setEffectKey(key);
        setIsCustom(false);
        setLabel(config.label || config.name);
        setIcon(config.icon || 'icons/svg/aura.svg');
        setSystemKey(config.key || '');
        setValue(config.value === 'REPLACEME' ? '1' : config.value);
        setMode(config.mode || 2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Validate
        if (isCustom && !systemKey) {
            alert('Please select a system key for custom effects');
            setLoading(false);
            return;
        }

        const effectData: any = {
            name: label || 'Custom Effect',
            label: label || 'Custom Effect',
            icon: icon,
            img: icon,
            changes: [
                {
                    key: systemKey,
                    value: value,
                    mode: Number(mode)
                }
            ],
            disabled: !enabled,
            transfer: true
        };

        if (initialData) {
            effectData._id = initialData._id || initialData.id;
        }

        try {
            if (initialData && onUpdate) {
                await onUpdate(effectData);
            } else if (onCreate) {
                await onCreate(effectData);
            }
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white border-4 border-black w-full max-w-2xl shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh] overflow-hidden rounded-none text-neutral-900">

                {/* Header */}
                <div className="bg-black p-6 border-b-2 border-white flex justify-between items-center">
                    <h2 className="text-2xl font-black font-serif text-white uppercase tracking-widest">
                        {initialData ? 'Edit Effect' : 'Add Effect'}
                    </h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-2 text-xl">
                        <X size={28} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">

                    {/* Effect Selection (only show in create mode) */}
                    {!initialData && (
                        <div className="space-y-2">
                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black">Select Effect Template</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4 z-10" />
                                <select
                                    value={effectKey}
                                    onChange={e => handleSelectEffect(e.target.value)}
                                    className="w-full bg-white border-2 border-black text-black text-xs font-black uppercase py-3 pl-10 pr-4 focus:bg-neutral-50 outline-none appearance-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                                >
                                    <option value="">Select an effect...</option>
                                    <optgroup label="Custom" className="bg-neutral-100 italic">
                                        <option value="custom_custom_new" className="not-italic">+ Create Custom Effect</option>
                                    </optgroup>
                                    <optgroup label="Predefined" className="bg-neutral-100 italic">
                                        {effectOptions.map(opt => (
                                            <option key={opt.key} value={opt.key} className="not-italic">{opt.label}</option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Effect Configuration */}
                    {(effectKey || initialData) && (
                        <div className="bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <div className="bg-black text-white px-4 py-3 text-[10px] uppercase font-black tracking-widest">
                                Effect Configuration
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Icon Preview */}
                                <div className="flex items-center gap-4">
                                    <div className="relative shrink-0">
                                        <img src={resolveImageUrl(icon)} alt="" className="w-16 h-16 object-cover bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
                                        {!enabled && <div className="absolute inset-0 bg-neutral-900/40 border-2 border-black flex items-center justify-center"><Power className="text-white w-6 h-6" /></div>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-serif font-black text-lg">{label || 'Effect Name'}</div>
                                        <div className="text-xs text-neutral-500 font-mono">{systemKey || 'No key selected'}</div>
                                    </div>
                                    <button
                                        onClick={() => setEnabled(!enabled)}
                                        className={`p-3 border-2 transition-all ${enabled
                                            ? 'bg-neutral-100 border-neutral-200 text-neutral-400 hover:bg-black hover:border-black hover:text-white'
                                            : 'bg-black border-black text-white hover:bg-neutral-800'
                                            }`}
                                        title={enabled ? 'Effect Enabled (click to disable)' : 'Effect Disabled (click to enable)'}
                                    >
                                        <Power size={20} strokeWidth={3} />
                                    </button>
                                </div>

                                {/* Custom Effect Fields */}
                                {isCustom && (
                                    <>
                                        <div>
                                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Effect Name</label>
                                            <input
                                                type="text"
                                                className="w-full bg-white border-2 border-black text-black text-sm font-black uppercase px-3 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:bg-neutral-50 outline-none"
                                                placeholder="Name / Label"
                                                value={label}
                                                onChange={e => setLabel(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">System Key</label>
                                            <select
                                                className="w-full bg-white border-2 border-black text-neutral-600 font-mono text-xs px-3 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:border-black focus:text-black outline-none"
                                                value={systemKey}
                                                onChange={e => setSystemKey(e.target.value)}
                                            >
                                                <option value="">Select system key...</option>
                                                {(() => {
                                                    const groups: Record<string, Array<{ key: string; label: string }>> = {
                                                        'Abilities (Bonus)': [],
                                                        'Abilities (Base/Permanent)': [],
                                                        'Combat Bonuses': [],
                                                        'Spellcasting': [],
                                                        'Other': []
                                                    };

                                                    Object.entries(EFFECT_TRANSLATIONS_MAP).forEach(([key, label]) => {
                                                        if (key.includes('abilities') && key.endsWith('.bonus')) {
                                                            groups['Abilities (Bonus)'].push({ key, label });
                                                        } else if (key.includes('abilities') && key.endsWith('.base')) {
                                                            groups['Abilities (Base/Permanent)'].push({ key, label });
                                                        } else if (key.includes('bonuses.melee') || key.includes('bonuses.ranged') ||
                                                            key.includes('bonuses.attack') || key.includes('bonuses.damage') ||
                                                            key.includes('bonuses.ac')) {
                                                            groups['Combat Bonuses'].push({ key, label });
                                                        } else if (key.includes('spellcasting')) {
                                                            groups['Spellcasting'].push({ key, label });
                                                        } else {
                                                            groups['Other'].push({ key, label });
                                                        }
                                                    });

                                                    return Object.entries(groups).map(([groupName, items]) =>
                                                        items.length > 0 && (
                                                            <optgroup key={groupName} label={groupName}>
                                                                {items.map(({ key, label }) => (
                                                                    <option key={key} value={key}>{label}</option>
                                                                ))}
                                                            </optgroup>
                                                        )
                                                    );
                                                })()}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* Value and Mode */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Value</label>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={e => setValue(e.target.value)}
                                            className="w-full bg-white border-2 border-black text-center text-black font-black text-lg py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:bg-neutral-50 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Mode</label>
                                        <select
                                            value={mode}
                                            onChange={e => setMode(Number(e.target.value))}
                                            className="w-full bg-white border-2 border-black text-xs font-black uppercase text-black py-2 px-3 cursor-pointer hover:bg-neutral-50 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none"
                                        >
                                            {MODES.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-neutral-100 border-t-4 border-black flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="h-12 bg-neutral-200 text-black border-2 border-black px-8 font-black font-serif uppercase tracking-widest text-xs hover:bg-neutral-300 transition-all active:translate-x-[2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || (!effectKey && !initialData) || (isCustom && !systemKey)}
                        className={`
                            px-10 py-3 bg-black text-white font-serif font-black text-lg uppercase tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] 
                            hover:bg-neutral-800 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all
                            ${(loading || (!effectKey && !initialData) || (isCustom && !systemKey)) ? 'opacity-30 grayscale cursor-not-allowed' : ''}
                        `}
                    >
                        {loading ? 'Saving...' : (initialData ? 'Save Changes' : 'Add Effect')}
                    </button>
                </div>
            </div>
        </div>
    );
}
