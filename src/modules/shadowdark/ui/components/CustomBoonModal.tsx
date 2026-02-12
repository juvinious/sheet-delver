import React, { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Settings, Power, Search } from 'lucide-react';
import { resolveEntityName } from '../sheet-utils';
import { useConfig } from '@/app/ui/context/ConfigContext';
import { BOON_TYPE_MAP, EFFECT_TRANSLATIONS_MAP } from '../../data/talent-effects';

interface CustomBoonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: any) => Promise<void>;
    onUpdate?: (data: any, deletedEffectIds?: string[]) => Promise<void>;
    initialData?: any;
    systemConfig?: any;
    predefinedEffects?: Record<string, any>;
}

// Fallback if config is missing
const DEFAULT_BOON_TYPES = {
    blessing: "Blessing",
    oath: "Oath",
    secret: "Secret"
};

const MODES = [
    { value: 2, label: 'ADD' },
    { value: 1, label: 'MULTIPLY' },
    { value: 5, label: 'OVERRIDE' },
    { value: 0, label: 'CUSTOM' },
    { value: 3, label: 'UPGRADE' },
    { value: 4, label: 'DOWNGRADE' },
];

export default function CustomBoonModal({ isOpen, onClose, onCreate, onUpdate, initialData, systemConfig, predefinedEffects }: CustomBoonModalProps) {
    const { resolveImageUrl } = useConfig();
    const [name, setName] = useState('');
    const [boonType, setBoonType] = useState('blessing');
    const [level, setLevel] = useState(1);
    const [loading, setLoading] = useState(false);

    // Selected Effects
    const [selectedEffects, setSelectedEffects] = useState<any[]>([]);

    // Track IDs of effects that were originally present but removed (or to be replaced)
    // For simplicity, we might replace all effects on update to ensure 1:1 mapping with UI
    const [originalEffectIds, setOriginalEffectIds] = useState<string[]>([]);

    // const boonTypes = systemConfig?.BOON_TYPES || DEFAULT_BOON_TYPES;

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
            setName(initialData.name || '');
            setBoonType(initialData.system?.boonType || initialData.system?.type || 'blessing');
            setLevel(initialData.system?.level?.value !== undefined ? initialData.system.level.value : (initialData.system?.level || 1));

            if (initialData.effects) {
                const ids: string[] = [];
                const parsed = initialData.effects.flatMap((ae: any) => {
                    ids.push(ae._id || ae.id);
                    const changes = ae.changes || [];
                    if (changes.length === 0) return [];
                    return changes.map((c: any) => {
                        // Attempt match
                        let matchKey = 'custom';
                        let matchConfig: any = null;

                        const effectsMap = predefinedEffects || systemConfig?.PREDEFINED_EFFECTS || {};

                        const found = Object.entries(effectsMap).find(([_key, conf]: any) =>
                            conf && conf.effectKey === c.key
                        );

                        if (found) {
                            matchKey = found[0];
                            matchConfig = found[1];
                        }

                        return {
                            id: crypto.randomUUID(),
                            key: matchKey,
                            label: matchConfig?.name || ae.name || 'Custom Effect',
                            icon: matchConfig?.img || ae.icon || 'icons/svg/aura.svg',
                            effectKey: c.key,
                            value: c.value,
                            mode: Number(c.mode ?? 2),
                            enabled: !ae.disabled
                        };
                    });
                });
                setSelectedEffects(parsed);
                setOriginalEffectIds(ids);
            }
        }
    }, [initialData, predefinedEffects, systemConfig]);

    if (!isOpen) return null;

    const handleAddEffect = (key: string) => {
        if (!key) return;

        if (key === 'custom_custom_new') {
            // Add Custom Effect Row
            const newEffect = {
                id: crypto.randomUUID(),
                key: 'custom',
                label: 'Custom Bonus',
                icon: 'icons/skills/melee/strike-axe-blood-red.webp',
                effectKey: '',
                value: '1',
                mode: 2,
                enabled: true
            };
            setSelectedEffects(prev => [...prev, newEffect]);
            return;
        }

        const config = systemConfig?.PREDEFINED_EFFECTS?.[key];
        if (!config) return;

        const newEffect = {
            id: crypto.randomUUID(),
            key: key,
            label: config.label || config.name,
            icon: config.icon || 'icons/svg/aura.svg',
            effectKey: config.key || '',
            value: config.value === 'REPLACEME' ? 1 : config.value,
            mode: config.mode || 2,
            enabled: true
        };

        setSelectedEffects(prev => [...prev, newEffect]);
    };

    const handleRemoveEffect = (id: string) => {
        setSelectedEffects(prev => prev.filter(e => e.id !== id));
    };

    const handleToggleEffect = (id: string) => {
        setSelectedEffects(prev => prev.map(e =>
            e.id === id ? { ...e, enabled: !e.enabled } : e
        ));
    };

    const handleUpdateEffect = (id: string, updates: any) => {
        setSelectedEffects(prev => prev.map(e =>
            e.id === id ? { ...e, ...updates } : e
        ));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const itemData: any = {
            name: name || 'New Boon',
            type: 'Boon',
            img: initialData?.img || 'icons/skills/social/diplomacy-writing-letter.webp',
            system: {
                boonType: boonType,
                level: Number(level),
                description: initialData?.system?.description || '<p>Custom Boon created via Sheet Delver.</p>'
            },
            effects: []
        };

        if (initialData) {
            itemData._id = initialData._id || initialData.id;
        }

        itemData.effects = selectedEffects
            .filter(eff => !(eff.key === 'custom' && !eff.effectKey)) // Filter out invalid custom effects
            .map(eff => ({
                name: eff.label,
                label: eff.label,
                icon: eff.icon,
                img: eff.icon,
                changes: [
                    {
                        key: eff.effectKey,
                        value: eff.value,
                        mode: Number(eff.mode)
                    }
                ],
                disabled: !eff.enabled,
                transfer: true
            }));

        try {
            if (initialData && onUpdate) {
                // If updating, we pass the original IDs to delete them (Recall Strategy)
                await onUpdate(itemData, originalEffectIds);
            } else {
                await onCreate(itemData);
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
                        {initialData ? 'Edit Boon' : 'Create Custom Boon'}
                    </h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-2 text-xl">
                        <X size={28} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-50 p-6 border-2 border-dashed border-neutral-200">
                        <div className="md:col-span-2">
                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Boon Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-white border-2 border-black text-black px-4 py-3 focus:bg-neutral-50 outline-none font-serif text-xl font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                placeholder="e.g. Titan's Grip"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Type</label>
                            <div className="relative">
                                <select
                                    value={boonType}
                                    onChange={e => setBoonType(e.target.value)}
                                    className="w-full bg-white border-2 border-black text-black px-4 py-3 focus:bg-neutral-50 outline-none font-black uppercase text-xs appearance-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                >
                                    {Object.entries(BOON_TYPE_MAP).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-[0.2em] text-neutral-500 font-black mb-2">Level Gained</label>
                            <input
                                type="number"
                                value={level}
                                onChange={e => setLevel(Number(e.target.value))}
                                className="w-full bg-white border-2 border-black text-black px-4 py-3 focus:bg-neutral-50 outline-none font-serif text-xl font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>

                    {/* Effects Section */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="text-xl font-black font-serif uppercase tracking-widest text-black border-b-4 border-black pb-1">Effects</h3>

                            {/* Dropdown Adder */}
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4 z-10" />
                                <select
                                    value=""
                                    onChange={e => handleAddEffect(e.target.value)}
                                    className="w-full bg-white border-2 border-black text-black text-xs font-black uppercase py-3 pl-10 pr-4 focus:bg-neutral-50 outline-none appearance-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                                >
                                    <option value="" disabled>+ Add Effect...</option>
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

                        <div className="bg-white border-2 border-black overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            {/* List Header */}
                            <div className="grid grid-cols-[1fr_100px_100px] text-[10px] uppercase font-black tracking-widest text-white bg-black px-4 py-3">
                                <div>Effect / Configuration</div>
                                <div className="text-center">Value / Mode</div>
                                <div className="text-right pr-2">Options</div>
                            </div>

                            {/* List Body */}
                            <div className="divide-y-2 divide-neutral-100">
                                {selectedEffects.length === 0 && (
                                    <div className="p-8 text-center text-neutral-400 text-xs font-black uppercase tracking-widest italic flex flex-col gap-2">
                                        <span className="text-3xl not-italic">?</span>
                                        No effects added.
                                    </div>
                                )}
                                {selectedEffects.map(eff => (
                                    <div key={eff.id} className="grid grid-cols-[1fr_100px_100px] items-start px-4 py-4 text-sm hover:bg-neutral-50 transition-colors group">

                                        {/* Effect Column (Dynamic based on 'custom') */}
                                        <div className="flex items-start gap-4 overflow-hidden pr-2">
                                            <div className="relative shrink-0">
                                                <img src={resolveImageUrl(eff.icon)} alt="" className="w-10 h-10 object-cover bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
                                                {!eff.enabled && <div className="absolute inset-0 bg-neutral-900/40 border-2 border-black flex items-center justify-center"><Power className="text-white w-4 h-4" /></div>}
                                            </div>

                                            {eff.key === 'custom' ? (
                                                <div className="flex flex-col gap-2 w-full">
                                                    <input
                                                        type="text"
                                                        className="bg-white border-2 border-black text-black text-xs font-black uppercase px-2 py-1.5 w-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:bg-neutral-50 outline-none"
                                                        placeholder="Name / Label"
                                                        value={eff.label}
                                                        onChange={e => handleUpdateEffect(eff.id, { label: e.target.value })}
                                                    />
                                                    <select
                                                        className="bg-white border-2 border-neutral-200 text-neutral-600 font-mono text-[9px] px-2 py-1 w-full focus:border-black focus:text-black outline-none"
                                                        value={eff.effectKey}
                                                        onChange={e => handleUpdateEffect(eff.id, { effectKey: e.target.value })}
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
                                            ) : (
                                                <div className="flex flex-col overflow-hidden py-0.5">
                                                    <span className="truncate font-serif font-black uppercase tracking-wider text-black" title={eff.label}>{eff.label}</span>
                                                    <span className="truncate text-[10px] text-neutral-500 font-mono mt-1" title={eff.effectKey}>
                                                        {eff.effectKey}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Changes Column (Value & Mode) */}
                                        <div className="flex flex-col gap-2 justify-center items-center">
                                            <input
                                                type="text"
                                                value={eff.value}
                                                onChange={e => handleUpdateEffect(eff.id, { value: e.target.value })}
                                                className="w-16 bg-white border-2 border-black text-center text-black font-black text-xs py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:bg-neutral-50 outline-none"
                                            />
                                            <select
                                                value={eff.mode}
                                                onChange={e => handleUpdateEffect(eff.id, { mode: Number(e.target.value) })}
                                                className="w-full max-w-[80px] bg-neutral-100 border-none text-[9px] font-black uppercase text-neutral-600 py-1 text-center cursor-pointer hover:bg-neutral-200 transition-colors"
                                            >
                                                {MODES.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Options Column */}
                                        <div className="flex justify-end gap-1 pt-1">
                                            <button
                                                onClick={() => handleToggleEffect(eff.id)}
                                                className={`p-2 border-2 transition-all ${eff.enabled
                                                    ? 'bg-neutral-100 border-neutral-200 text-neutral-400 hover:bg-black hover:border-black hover:text-white'
                                                    : 'bg-black border-black text-white hover:bg-neutral-800'
                                                    }`}
                                                title={eff.enabled ? 'Effect Enabled (click to disable)' : 'Effect Disabled (click to enable)'}
                                            >
                                                <Power size={18} strokeWidth={3} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveEffect(eff.id)}
                                                className="p-2 border-2 border-neutral-100 text-neutral-300 hover:border-black hover:text-red-600 transition-all"
                                                title="Remove"
                                            >
                                                <Trash2 size={18} strokeWidth={3} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer (Consistency with Language modal) */}
                <div className="p-6 bg-neutral-100 border-t-4 border-black flex justify-between items-center">
                    <button
                        onClick={onClose}
                        className="h-12 bg-neutral-200 text-black border-2 border-black px-8 font-black font-serif uppercase tracking-widest text-xs hover:bg-neutral-300 transition-all active:translate-x-[2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !name}
                        className={`
                            px-10 py-3 bg-black text-white font-serif font-black text-lg uppercase tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] 
                            hover:bg-neutral-800 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all
                            ${(loading || !name) ? 'opacity-30 grayscale cursor-not-allowed' : ''}
                        `}
                    >
                        {loading ? 'Saving...' : (initialData ? 'Save Changes' : 'Create Boon')}
                    </button>
                </div>
            </div>
        </div>
    );
}
