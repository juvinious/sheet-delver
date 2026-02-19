import React, { useState } from 'react';
import RichTextEditor from '@/app/ui/components/RichTextEditor';
import { morkborgTheme } from '../../themes/morkborg';

interface ItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (path: string, value: any) => void;
    item: any;
    actor: any;
}

export default function ItemModal({ isOpen, onClose, onUpdate, item }: ItemModalProps) {
    const [activeTab, setActiveTab] = useState<'description' | 'details'>('description');

    if (!isOpen || !item) return null;

    const handleChange = (path: string, value: any) => {
        onUpdate(path, value);
    };

    const renderDetails = () => {
        const type = item.type;
        const system = item.system || {};

        return (
            <div className="space-y-4 font-morkborg text-xl uppercase tracking-tight">
                <style dangerouslySetInnerHTML={{
                    __html: `
                    input[type=number]::-webkit-inner-spin-button, 
                    input[type=number]::-webkit-outer-spin-button { 
                        -webkit-appearance: none; 
                        margin: 0; 
                    }
                    input[type=number] {
                        -moz-appearance: textfield;
                    }
                `}} />

                {/* Base Fields */}
                <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                    <span className="text-yellow-500">Price:</span>
                    <input
                        type="number"
                        value={system.price ?? 0}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                            handleChange('system.price', isNaN(val) ? 0 : val);
                        }}
                        className="bg-transparent text-right outline-none w-20 font-mono text-white"
                    />
                </div>
                <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                    <span className="text-yellow-500">Carry Weight:</span>
                    <input
                        type="number"
                        step="0.1"
                        value={system.carryWeight ?? 0}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            handleChange('system.carryWeight', isNaN(val) ? 0 : val);
                        }}
                        className="bg-transparent text-right outline-none w-20 font-mono text-white"
                    />
                </div>
                {type !== 'container' && (
                    <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                        <span className="text-yellow-500">Container Space:</span>
                        <input
                            type="number"
                            step="0.1"
                            value={system.containerSpace ?? 1}
                            onChange={(e) => handleChange('system.containerSpace', parseFloat(e.target.value))}
                            className="bg-transparent text-right outline-none w-20 font-mono text-white"
                        />
                    </div>
                )}

                {/* Specific Fields */}
                {type === 'weapon' && (
                    <>
                        <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                            <span className="text-yellow-500">Damage Die:</span>
                            <input
                                type="text"
                                value={system.damageDie || '1d4'}
                                onChange={(e) => handleChange('system.damageDie', e.target.value)}
                                className="bg-transparent text-right outline-none w-32 font-mono text-white"
                            />
                        </div>
                        <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                            <span className="text-yellow-500">Crit On:</span>
                            <input
                                type="number"
                                value={system.critOn ?? 20}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 20 : parseInt(e.target.value);
                                    handleChange('system.critOn', isNaN(val) ? 20 : val);
                                }}
                                className="bg-transparent text-right outline-none w-20 font-mono text-white"
                            />
                        </div>
                        <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                            <span className="text-yellow-500">Fumble On:</span>
                            <input
                                type="number"
                                value={system.fumbleOn ?? 1}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                                    handleChange('system.fumbleOn', isNaN(val) ? 1 : val);
                                }}
                                className="bg-transparent text-right outline-none w-20 font-mono text-white"
                            />
                        </div>
                    </>
                )}

                {type === 'armor' && (
                    <>
                        <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                            <span className="text-yellow-500">Current Tier:</span>
                            <input
                                type="number"
                                value={system.tier?.value ?? 1}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                                    handleChange('system.tier.value', isNaN(val) ? 1 : val);
                                }}
                                className="bg-transparent text-right outline-none w-20 font-mono text-white"
                            />
                        </div>
                        <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                            <span className="text-yellow-500">Max Tier:</span>
                            <input
                                type="number"
                                value={system.tier?.max ?? 1}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 1 : parseInt(e.target.value);
                                    handleChange('system.tier.max', isNaN(val) ? 1 : val);
                                }}
                                className="bg-transparent text-right outline-none w-20 font-mono text-white"
                            />
                        </div>
                    </>
                )}

                {type === 'container' && (
                    <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                        <span className="text-yellow-500">Capacity:</span>
                        <input
                            type="number"
                            value={system.capacity ?? 7}
                            onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                handleChange('system.capacity', isNaN(val) ? 0 : val);
                            }}
                            className="bg-transparent text-right outline-none w-20 font-mono text-white"
                        />
                    </div>
                )}

                {(type === 'misc' || type === 'ammo') && (
                    <div className="flex items-center justify-between border-b border-yellow-500/30 pb-1">
                        <span className="text-yellow-500">Quantity:</span>
                        <input
                            type="number"
                            value={system.quantity ?? 1}
                            onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                handleChange('system.quantity', isNaN(val) ? 0 : val);
                            }}
                            className="bg-transparent text-right outline-none w-20 font-mono text-white"
                        />
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl bg-neutral-900 border-2 border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-2 right-4 text-3xl text-white/50 hover:text-white transition-colors z-10 font-bold"
                >
                    ×
                </button>

                {/* Header */}
                <div className="p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
                        <img src={item.img} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 w-full text-center sm:text-left">
                        <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            className="bg-transparent font-morkborg text-2xl sm:text-4xl text-white tracking-widest leading-none mb-1 w-full outline-none border-none focus:ring-0 text-center sm:text-left"
                        />
                        <div className="h-1 bg-yellow-500 w-full mb-2 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>
                        <div className="font-morkborg text-xl sm:text-2xl text-white/80 tracking-tighter uppercase opacity-70">
                            {item.type}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex font-morkborg text-xl sm:text-2xl px-4 sm:px-6 border-b border-white/10 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab('description')}
                        className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 relative transition-all whitespace-nowrap ${activeTab === 'description' ? 'text-white border-x border-t border-white/20 bg-neutral-800' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Description
                        {activeTab === 'description' && <div className="absolute -bottom-px left-0 right-0 h-px bg-neutral-800"></div>}
                    </button>
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 relative transition-all whitespace-nowrap ${activeTab === 'details' ? 'text-white border-x border-t border-white/20 bg-neutral-800' : 'text-white/40 hover:text-white/60'}`}
                    >
                        Details
                        {activeTab === 'details' && <div className="absolute -bottom-px left-0 right-0 h-px bg-neutral-800"></div>}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-neutral-800/30 scrollbar-hide">
                    {activeTab === 'description' ? (
                        <div className="font-serif text-base sm:text-lg leading-relaxed text-neutral-300">
                            <RichTextEditor
                                content={item.system?.description || ''}
                                onSave={(html) => handleChange('system.description', html)}
                                editButtonText="Edit Item Description"
                                theme={morkborgTheme.richText}
                            />
                        </div>
                    ) : (
                        renderDetails()
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="font-morkborg text-2xl text-yellow-500 hover:text-white px-8 py-1 border border-yellow-500/50 hover:bg-yellow-500/20 transition-all uppercase"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}
