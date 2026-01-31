import React, { useState, useMemo, useEffect } from 'react';
import { X, Trash2, Settings, Power, Plus } from 'lucide-react';
import { resolveImage } from '../sheet-utils';

interface CustomBoonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: any) => Promise<void>;
    onUpdate?: (data: any, deletedEffectIds?: string[]) => Promise<void>;
    initialData?: any;
    systemConfig?: any;
    predefinedEffects?: Record<string, any>;
    foundryUrl?: string;
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

export default function CustomBoonModal({ isOpen, onClose, onCreate, onUpdate, initialData, systemConfig, predefinedEffects, foundryUrl }: CustomBoonModalProps) {
    const [name, setName] = useState('');
    const [boonType, setBoonType] = useState('blessing');
    const [level, setLevel] = useState(1);
    const [loading, setLoading] = useState(false);

    // Selected Effects
    const [selectedEffects, setSelectedEffects] = useState<any[]>([]);

    // Track IDs of effects that were originally present but removed (or to be replaced)
    // For simplicity, we might replace all effects on update to ensure 1:1 mapping with UI
    const [originalEffectIds, setOriginalEffectIds] = useState<string[]>([]);

    const boonTypes = systemConfig?.BOON_TYPES || DEFAULT_BOON_TYPES;

    // Flatten predefined effects for dropdown
    const effectOptions = useMemo(() => {
        const effects = predefinedEffects || systemConfig?.PREDEFINED_EFFECTS || {};
        return Object.entries(effects).map(([key, val]: [string, any]) => ({
            key,
            label: val.name || key
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [predefinedEffects, systemConfig]);

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

                        const found = Object.entries(effectsMap).find(([_, conf]: any) =>
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
                icon: 'icons/svg/aura.svg',
                effectKey: '',
                value: '1',
                mode: 2,
                enabled: true
            };
            setSelectedEffects(prev => [...prev, newEffect]);
            return;
        }

        const config = (predefinedEffects || systemConfig?.PREDEFINED_EFFECTS)?.[key];
        if (!config) return;

        // Default Value Logic
        let val = config.defaultValue;
        if (val === 'REPLACEME') val = 1;

        let mode = 2;
        if (config.mode && typeof config.mode === 'string') {
            if (config.mode.includes('OVERRIDE')) mode = 5;
            else if (config.mode.includes('MULTIPLY')) mode = 1;
        }

        const newEffect = {
            id: crypto.randomUUID(),
            key: key,
            label: config.name,
            icon: config.img || 'icons/svg/aura.svg',
            effectKey: config.effectKey,
            value: val,
            mode: mode,
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-neutral-800 p-4 border-b border-neutral-700 flex justify-between items-center">
                    <h2 className="text-xl font-serif text-amber-500 font-bold tracking-wide">
                        {initialData ? 'Edit Boon' : 'Create Custom Boon'}
                    </h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 font-bold mb-1">Boon Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-700 text-white px-3 py-2 focus:border-amber-500 outline-none font-serif text-lg"
                                placeholder="e.g. Titan's Grip"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 font-bold mb-1">Type</label>
                            <select
                                value={boonType}
                                onChange={e => setBoonType(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-700 text-white px-3 py-2 focus:border-amber-500 outline-none font-sans"
                            >
                                {Object.entries(boonTypes).map(([key, label]: [string, any]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 font-bold mb-1">Level Gained</label>
                            <input
                                type="number"
                                value={level}
                                onChange={e => setLevel(Number(e.target.value))}
                                className="w-full bg-neutral-950 border border-neutral-700 text-white px-3 py-2 focus:border-amber-500 outline-none font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>

                    <hr className="border-neutral-800" />

                    {/* Effects Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-300">Effects</h3>

                            {/* Dropdown Adder */}
                            <div className="relative w-64">
                                <select
                                    value=""
                                    onChange={e => handleAddEffect(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-700 text-white text-xs px-2 py-1.5 pl-8 focus:border-amber-500 outline-none appearance-none rounded"
                                >
                                    <option value="" disabled>Add Effect...</option>
                                    <optgroup label="Custom">
                                        <option value="custom_custom_new">+ Create Custom Effect</option>
                                    </optgroup>
                                    <optgroup label="Predefined">
                                        {effectOptions.map(opt => (
                                            <option key={opt.key} value={opt.key}>{opt.label}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <Settings className="absolute left-2.5 top-2 text-neutral-500 pointer-events-none" size={14} />
                            </div>
                        </div>

                        <div className="bg-neutral-950 border border-neutral-800 rounded overflow-hidden">
                            {/* List Header */}
                            <div className="grid grid-cols-[1fr_80px_80px] text-[10px] uppercase font-bold text-neutral-500 bg-neutral-900 border-b border-neutral-800 px-3 py-2">
                                <div>Effect / Key</div>
                                <div className="text-center">Changes</div>
                                <div className="text-right">Options</div>
                            </div>

                            {/* List Body */}
                            <div className="divide-y divide-neutral-800">
                                {selectedEffects.length === 0 && (
                                    <div className="p-4 text-center text-neutral-600 text-xs italic">
                                        No effects added. Select one above.
                                    </div>
                                )}
                                {selectedEffects.map(eff => (
                                    <div key={eff.id} className="grid grid-cols-[1fr_80px_80px] items-center px-3 py-2 text-sm hover:bg-neutral-900/50 transition-colors">

                                        {/* Effect Column (Dynamic based on 'custom') */}
                                        <div className="flex items-center gap-3 overflow-hidden pr-2">
                                            <img src={resolveImage(eff.icon, foundryUrl)} alt="" className="w-6 h-6 object-cover bg-neutral-800 rounded-sm shrink-0" />

                                            {eff.key === 'custom' ? (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <input
                                                        type="text"
                                                        className="bg-black border border-neutral-700 text-white text-xs px-1 py-0.5 w-full placeholder-neutral-600"
                                                        placeholder="Name / Label"
                                                        value={eff.label}
                                                        onChange={e => handleUpdateEffect(eff.id, { label: e.target.value })}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="bg-black border border-neutral-700 text-amber-500 font-mono text-[10px] px-1 py-0.5 w-full placeholder-neutral-600"
                                                        placeholder="system.key..."
                                                        value={eff.effectKey}
                                                        onChange={e => handleUpdateEffect(eff.id, { effectKey: e.target.value })}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="truncate font-medium text-neutral-200" title={eff.label}>{eff.label}</span>
                                                    <span className="truncate text-[10px] text-neutral-500 font-mono" title={eff.effectKey}>
                                                        {eff.effectKey.split('.').slice(-2).join('.')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Changes Column (Value & Mode) */}
                                        <div className="flex flex-col gap-1 justify-center items-center">
                                            <input
                                                type="text"
                                                value={eff.value}
                                                onChange={e => handleUpdateEffect(eff.id, { value: e.target.value })}
                                                className="w-16 bg-black border border-neutral-700 text-center text-white text-xs py-1 rounded focus:border-amber-500 outline-none"
                                            />
                                            {/* Mode Select for Custom (or all?) - Let's allow overriding mode even for predefined */}
                                            <select
                                                value={eff.mode}
                                                onChange={e => handleUpdateEffect(eff.id, { mode: Number(e.target.value) })}
                                                className="w-16 bg-neutral-800 border-none text-[10px] text-neutral-400 py-0 h-4 text-center rounded cursor-pointer"
                                            >
                                                {MODES.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Options Column */}
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleToggleEffect(eff.id)}
                                                className={`p-1.5 rounded transition-colors ${eff.enabled ? 'text-green-500 hover:bg-neutral-800' : 'text-neutral-600 hover:bg-neutral-800'}`}
                                                title={eff.enabled ? 'Enabled' : 'Disabled'}
                                            >
                                                <Power size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveEffect(eff.id)}
                                                className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-neutral-800 rounded transition-colors"
                                                title="Remove"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="bg-neutral-800 p-4 border-t border-neutral-700 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !name}
                        className={`
                            px-6 py-2 bg-amber-700 text-white text-sm font-bold uppercase tracking-widest shadow-lg 
                            hover:bg-amber-600 active:translate-y-0.5 transition-all
                            ${(loading || !name) ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {loading ? 'Saving...' : (initialData ? 'Save Changes' : 'Create Boon')}
                    </button>
                </div>
            </div>
        </div>
    );
}
