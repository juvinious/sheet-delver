import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface CreateTreasureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: any) => void;
}

export default function CreateTreasureModal({ isOpen, onClose, onCreate }: CreateTreasureModalProps) {
    const [name, setName] = useState('');
    const [gp, setGp] = useState(0);
    const [sp, setSp] = useState(0);
    const [cp, setCp] = useState(0);

    const handleCreate = () => {
        if (!name) return;

        onCreate({
            name,
            type: 'Basic', // Using Basic as generic item type, system.treasure handles the rest
            img: 'icons/containers/bags/pouch-simple-brown.webp',
            system: {
                treasure: true,
                quantity: 1,
                slots: { per_slot: 1, slots_used: 1 },
                cost: {
                    gp: Number(gp),
                    sp: Number(sp),
                    cp: Number(cp)
                }
            }
        });

        // Reset and close
        setName('');
        setGp(0);
        setSp(0);
        setCp(0);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-neutral-100 border-4 border-black w-full max-w-lg shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-black p-4 flex justify-between items-center text-white">
                    <h2 className="text-xl font-serif font-bold tracking-wider uppercase">Create Treasure</h2>
                    <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Treasure Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-white border-2 border-black p-2 font-serif focus:bg-neutral-50 outline-none"
                            placeholder="e.g. Golden Idol"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-amber-600 mb-1">Value (GP)</label>
                            <input
                                type="number"
                                value={gp}
                                onChange={(e) => setGp(Number(e.target.value))}
                                className="w-full bg-white border-2 border-black p-2 font-serif focus:bg-neutral-50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Value (SP)</label>
                            <input
                                type="number"
                                value={sp}
                                onChange={(e) => setSp(Number(e.target.value))}
                                className="w-full bg-white border-2 border-black p-2 font-serif focus:bg-neutral-50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-orange-700 mb-1">Value (CP)</label>
                            <input
                                type="number"
                                value={cp}
                                onChange={(e) => setCp(Number(e.target.value))}
                                className="w-full bg-white border-2 border-black p-2 font-serif focus:bg-neutral-50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-neutral-200 border-t-2 border-black flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold uppercase border-2 border-neutral-400 hover:border-black transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name}
                        className="px-6 py-2 bg-black text-white font-serif font-bold uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Check size={16} />
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
}
