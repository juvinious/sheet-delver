import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, Check, Coins } from 'lucide-react';

interface GemItem {
    id: string;
    name: string;
    system: {
        cost: {
            gp: number;
            sp: number;
            cp: number;
        };
        quantity: number;
    };
    img?: string;
}

interface GemBagModalProps {
    isOpen: boolean;
    onClose: () => void;
    actor: any;
    onUpdate: (path: string, value: any) => void;
    onCreateItem?: (data: any) => Promise<void>;
    onUpdateItem?: (data: any) => Promise<void>;
    onDeleteItem?: (itemId: string) => void;
}

export default function GemBagModal({
    isOpen,
    onClose,
    actor,
    onUpdate,
    onCreateItem,
    onUpdateItem,
    onDeleteItem
}: GemBagModalProps) {
    const [editingGem, setEditingGem] = useState<GemItem | null>(null);
    const [newName, setNewName] = useState('');
    const [newGp, setNewGp] = useState(0);
    const [isAdding, setIsAdding] = useState(false);

    const gems = (actor.items || []).filter((i: any) => i.type === 'Gem')
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const totalValue = gems.reduce((acc: number, gem: any) => {
        const cost = gem.system?.cost || {};
        return acc + (Number(cost.gp) || 0) + (Number(cost.sp) || 0) / 10 + (Number(cost.cp) || 0) / 100;
    }, 0);

    const handleAdd = async () => {
        if (!newName) return;
        if (onCreateItem) {
            await onCreateItem({
                name: newName,
                type: 'Gem',
                img: 'icons/commodities/gems/gem-rough-ball-red.webp',
                system: {
                    cost: {
                        gp: Number(newGp),
                        sp: 0,
                        cp: 0
                    },
                    quantity: 1
                }
            });
            setNewName('');
            setNewGp(0);
            setIsAdding(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingGem) return;
        if (onUpdateItem) {
            await onUpdateItem({
                _id: editingGem.id,
                name: newName,
                system: {
                    cost: {
                        gp: Number(newGp),
                        sp: 0,
                        cp: 0
                    }
                }
            });
            setEditingGem(null);
            setNewName('');
            setNewGp(0);
        }
    };

    const handleSell = async (gem: any) => {
        const cost = gem.system?.cost || {};
        const gp = Number(cost.gp) || 0;
        const sp = Number(cost.sp) || 0;
        const cp = Number(cost.cp) || 0;

        // Add to actor's coins
        const currentGp = Number(actor.system?.coins?.gp) || 0;
        const currentSp = Number(actor.system?.coins?.sp) || 0;
        const currentCp = Number(actor.system?.coins?.cp) || 0;

        const newGp = currentGp + gp;
        const newSp = currentSp + sp;
        const newCp = currentCp + cp;

        // Perform updates (batching might be needed if onUpdate is slow, but usually okay)
        if (gp > 0) onUpdate('system.coins.gp', newGp);
        if (sp > 0) onUpdate('system.coins.sp', newSp);
        if (cp > 0) onUpdate('system.coins.cp', newCp);

        // Delete the item
        if (onDeleteItem) onDeleteItem(gem.id);
    };

    const handleSellAll = async () => {
        if (gems.length === 0) return;

        // Sum all costs
        let totalGp = 0;
        let totalSp = 0;
        let totalCp = 0;

        gems.forEach((gem: any) => {
            const cost = gem.system?.cost || {};
            totalGp += Number(cost.gp) || 0;
            totalSp += Number(cost.sp) || 0;
            totalCp += Number(cost.cp) || 0;
        });

        // Add to actor's coins
        const currentGp = Number(actor.system?.coins?.gp) || 0;
        const currentSp = Number(actor.system?.coins?.sp) || 0;
        const currentCp = Number(actor.system?.coins?.cp) || 0;

        if (totalGp > 0) onUpdate('system.coins.gp', currentGp + totalGp);
        if (totalSp > 0) onUpdate('system.coins.sp', currentSp + totalSp);
        if (totalCp > 0) onUpdate('system.coins.cp', currentCp + totalCp);

        // Delete all items
        if (onDeleteItem) {
            for (const gem of gems) {
                onDeleteItem(gem.id);
            }
        }
    };

    const startEdit = (gem: any) => {
        setEditingGem(gem);
        setNewName(gem.name);
        setNewGp(gem.system?.cost?.gp || 0);
        setIsAdding(false);
    };

    const cancelEdit = () => {
        setEditingGem(null);
        setNewName('');
        setNewGp(0);
        setIsAdding(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-neutral-100 border-4 border-black w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-black p-4 flex justify-between items-center text-white">
                    <h2 className="text-2xl font-serif font-bold tracking-wider uppercase">Gem Bag</h2>
                    <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {/* Add Gem Section */}
                    {!isAdding && !editingGem && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="w-full py-2 border-2 border-dashed border-neutral-400 text-neutral-500 hover:border-black hover:text-black font-serif font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                        >
                            <Plus size={18} />
                            Add New Gem
                        </button>
                    )}

                    {(isAdding || editingGem) && (
                        <div className="bg-white border-2 border-black p-4 space-y-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                            <h3 className="font-serif font-bold uppercase tracking-widest text-sm border-b border-neutral-200 pb-2">
                                {isAdding ? 'Add New Gem' : 'Edit Gem'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Gem Name</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full bg-neutral-50 border-2 border-black p-2 font-serif focus:bg-white outline-none"
                                        placeholder="e.g. Ruby"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Value (GP)</label>
                                    <input
                                        type="number"
                                        value={newGp}
                                        onChange={(e) => setNewGp(Number(e.target.value))}
                                        className="w-full bg-neutral-50 border-2 border-black p-2 font-serif focus:bg-white outline-none"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={cancelEdit}
                                    className="px-4 py-1 text-xs font-bold uppercase border-2 border-neutral-300 hover:border-black transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={isAdding ? handleAdd : handleUpdate}
                                    className="px-4 py-1 text-xs font-bold uppercase bg-black text-white border-2 border-black hover:bg-neutral-800 transition-colors flex items-center gap-1"
                                >
                                    <Check size={14} />
                                    {isAdding ? 'Add Gem' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Gem Table */}
                    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <div className="grid grid-cols-[1fr_80px_130px] border-b-2 border-black bg-neutral-100 text-[10px] font-bold uppercase tracking-widest p-2">
                            <div>Gem</div>
                            <div className="text-right">Value (GP)</div>
                            <div className="text-right">Actions</div>
                        </div>
                        <div className="divide-y divide-neutral-200">
                            {gems.map((gem: any) => (
                                <div key={gem.id} className="grid grid-cols-[1fr_80px_130px] items-center p-2 hover:bg-neutral-50 transition-colors">
                                    <div className="font-serif text-sm font-bold truncate pr-2">{gem.name}</div>
                                    <div className="text-right font-mono text-sm">{gem.system?.cost?.gp || 0}</div>
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={() => handleSell(gem)}
                                            className="p-1.5 text-amber-600 hover:text-amber-800 transition-colors"
                                            title="Sell Gem"
                                        >
                                            <Coins size={14} />
                                        </button>
                                        <button
                                            onClick={() => startEdit(gem)}
                                            className="p-1.5 text-neutral-400 hover:text-black transition-colors"
                                            title="Edit"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={() => onDeleteItem && onDeleteItem(gem.id)}
                                            className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {gems.length === 0 && (
                                <div className="p-8 text-center text-neutral-400 italic text-sm">
                                    Your gem bag is empty.
                                </div>
                            )}
                        </div>
                        <div className="border-t-2 border-black p-2 bg-neutral-50 flex justify-between items-center font-serif">
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Total Value</span>
                                <span className="text-lg font-bold text-amber-600">{totalValue.toFixed(2)} GP</span>
                            </div>
                            {gems.length > 0 && (
                                <button
                                    onClick={handleSellAll}
                                    className="px-3 py-1 bg-amber-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-amber-700 transition-colors flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                                >
                                    <Coins size={12} />
                                    Sell All Gems
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-200 border-t-2 border-black flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-2 bg-black text-white font-serif font-bold uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
