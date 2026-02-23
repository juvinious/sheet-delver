
import React, { useState } from 'react';
import RollModal from './components/RollModal';

interface ViolenceTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
}

export default function ViolenceTab({ actor, onRoll }: ViolenceTabProps) {
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; item: any; type: 'attack' | 'defend' }>({
        isOpen: false,
        title: '',
        item: null,
        type: 'attack'
    });

    const handleInitiative = (individual: boolean) => {
        onRoll('initiative', individual ? 'individual' : 'party');
    };

    const openRollModal = (item: any, type: 'attack' | 'defend') => {
        setModalConfig({
            isOpen: true,
            title: type === 'attack' ? 'Attack' : 'Defend',
            item,
            type
        });
    };

    return (
        <div className="p-1 flex flex-col gap-6">
            {/* Initiative Header */}
            <div className="bg-black text-white p-4 flex flex-col sm:flex-row justify-between sm:items-center border-l-4 border-pink-500 shadow-md gap-4 sm:gap-0 transform -rotate-1">
                <div>
                    <h3 className="font-morkborg text-2xl uppercase tracking-wider">Initiative</h3>

                    {actor.derived?.criticalHelpText && (
                        <div className="text-[14px] text-yellow-500 font-mono mt-0.5 leading-none">
                            {actor.derived.criticalHelpText}
                        </div>
                    )}
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => handleInitiative(false)}
                        className="flex-1 sm:flex-none bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 sm:py-1 font-bold border border-neutral-600 transition-colors uppercase tracking-widest text-xs"
                    >
                        PARTY
                    </button>
                    <button
                        onClick={() => handleInitiative(true)}
                        className="flex-1 sm:flex-none bg-pink-600 hover:bg-pink-500 text-black px-4 py-2 sm:py-1 font-bold border border-pink-800 transition-colors uppercase tracking-widest text-xs"
                    >
                        INDIVIDUAL
                    </button>
                </div>
            </div>

            {/* Weapons */}
            <div>
                <h3 className="font-morkborg text-3xl mb-4 border-b-4 border-pink-500 text-pink-500 inline-block pr-6 transform -rotate-1">Weapons</h3>
                <div className="grid grid-cols-1 gap-4 my-2">
                    {actor.items.weapons.filter((w: any) => w.equipped || w.system?.equipped).map((w: any, index: number) => (
                        <div key={w._id + (index ? index : w.name)} className={`bg-neutral-900/80 p-3 border-l-8 border-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group ${index % 2 === 0 ? 'rotate-1' : '-rotate-1'}`}>
                            <div className="flex items-center gap-4 flex-1">
                                <img src={w.img} alt={w.name} className="w-10 h-10 sm:w-12 sm:h-12 border border-neutral-600 flex-shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-bold text-lg sm:text-xl text-neutral-200 truncate">{w.name}</div>
                                    <div className="text-xs sm:text-sm text-red-500 font-mono tracking-tighter whitespace-nowrap overflow-hidden">
                                        Dmg: {w.damageDie || '1d4'} | Crit: {w.critOn}+ | Fum: {w.fumbleOn}-
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => openRollModal(w, 'attack')}
                                className="w-full sm:w-auto bg-red-900/50 hover:bg-red-600 text-red-100 px-6 py-2 font-morkborg text-xl uppercase tracking-widest transition-all border border-red-800 hover:border-red-400 shadow-[0_0_10px_rgba(255,0,0,0.1)] hover:shadow-[0_0_15px_rgba(255,0,0,0.4)]"
                            >
                                Attack
                            </button>
                        </div>
                    ))}
                    {!actor.items.weapons.filter((w: any) => w.equipped || w.system?.equipped).length && (
                        <div className="text-neutral-500 italic p-4 border border-dashed border-neutral-700">No weapons equipped. Equip one in the Equipment tab.</div>
                    )}
                </div>
            </div>

            {/* Armor */}
            <div>
                <h3 className="font-morkborg text-3xl mb-4 border-b-4 border-pink-500 text-pink-500 inline-block pr-6 transform rotate-1">Armor</h3>
                <div className="grid grid-cols-1 gap-4 my-2">
                    {actor.items.armor.filter((a: any) => a.equipped || a.system?.equipped).map((a: any, index: number) => (
                        <div key={(a._id || a.id) + index} className={`bg-neutral-900/80 p-3 border-l-8 border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${((index + actor.items.weapons.length) % 2 === 0) ? '-rotate-1' : 'rotate-1'}`}>
                            <div className="flex items-center gap-4 flex-1">
                                <img src={a.img} alt={a.name} className="w-10 h-10 sm:w-12 sm:h-12 border border-neutral-600 grayscale flex-shrink-0" />
                                <div className="min-w-0">
                                    <div className="font-bold text-lg sm:text-xl text-neutral-200 truncate">{a.name}</div>
                                    <div className="text-xs sm:text-sm text-slate-400 font-mono whitespace-nowrap overflow-hidden">
                                        Tier: {a.tier?.value || 1} | DR: -{a.damageReductionDie || 'd2'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => openRollModal(a, 'defend')}
                                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-600 text-slate-200 px-6 py-2 font-morkborg text-xl uppercase tracking-widest transition-all border border-slate-600"
                            >
                                Defend
                            </button>
                        </div>
                    ))}
                    {!actor.items.armor.filter((a: any) => a.equipped || a.system?.equipped).length && (
                        <div className="text-neutral-500 italic p-4 border border-dashed border-neutral-700">No armor equipped. Equip some in the Equipment tab.</div>
                    )}
                </div>
            </div>

            <div className="text-center mt-8 text-neutral-600 text-sm font-serif italic">
                &quot;Violence is not the answer. It is the question. The answer is yes.&quot;
            </div>

            {modalConfig.isOpen && (
                <RollModal
                    isOpen={modalConfig.isOpen}
                    onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    onRoll={onRoll}
                    title={modalConfig.title}
                    item={modalConfig.item}
                    actor={actor}
                    type={modalConfig.type}
                />
            )}
        </div>
    );
}
