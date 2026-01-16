import React, { useState } from 'react';
import { IM_Fell_Double_Pica, Inter } from 'next/font/google';
import BackgroundTab from './morkborg/BackgroundTab';
import EquipmentTab from './morkborg/EquipmentTab';
import ViolenceTab from './morkborg/ViolenceTab';
import SpecialTab from './morkborg/SpecialTab';

const fell = IM_Fell_Double_Pica({ weight: '400', subsets: ['latin'] });
const inter = Inter({ subsets: ['latin'] });

interface MorkBorgSheetProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onDeleteItem: (itemId: string) => void;
}

const StatBlock = ({ label, value, path, max, onUpdate }: { label: string, value: any, path: string, max?: any, onUpdate: any }) => (
    <div className="flex flex-col items-center bg-black/80 p-2 border border-neutral-700 min-w-[80px]">
        <span className={`${fell.className} text-amber-500 text-sm uppercase tracking-widest mb-1`}>{label}</span>
        <div className="flex items-center gap-1 font-mono text-2xl text-white">
            <input
                type="number"
                value={value}
                onChange={(e) => onUpdate(path, Number(e.target.value))}
                className="bg-transparent w-12 text-center focus:outline-none focus:text-amber-400"
            />
            {max !== undefined && (
                <>
                    <span className="text-neutral-500">/</span>
                    <input
                        type="number"
                        value={max}
                        readOnly
                        className="bg-transparent w-12 text-center text-neutral-500 focus:outline-none"
                    />
                </>
            )}
        </div>
    </div>
);

const AbilityBlock = ({ label, value, path, onRoll }: { label: string, value: number, path: string, onRoll: any }) => (
    <div className="flex items-center gap-4 group cursor-pointer" onClick={() => onRoll('ability', label.toLowerCase())}>
        <div className={`${fell.className} text-3xl w-12 text-right group-hover:text-amber-500 transition-colors`}>
            {label.substring(0, 3)}
        </div>
        <div className={`${fell.className} text-4xl font-bold bg-black text-white w-14 h-14 flex items-center justify-center border-2 border-transparent group-hover:border-amber-500 transition-all shadow-md transform group-hover:scale-110`}>
            {value > 0 ? `+${value}` : value}
        </div>
    </div>
);

export default function MorkBorgSheet({ actor, onRoll, onUpdate, onDeleteItem }: MorkBorgSheetProps) {
    const [activeTab, setActiveTab] = useState<'background' | 'equipment' | 'violence' | 'special'>('violence');

    // Safety check
    if (!actor) return null;

    return (
        <div className={`min-h-screen text-[#111] ${inter.className} selection:bg-pink-500 selection:text-white`}>
            {/* Global Yellow Background Force */}
            <div className="fixed inset-0 -z-50" style={{ backgroundColor: '#ffe900' }}></div>

            {/* Texture Overlay - Global */}
            <div className="fixed inset-0 pointer-events-none opacity-5 mix-blend-overlay bg-[url('/textures/grunge.png')] z-40"></div>

            {/* Dark Wrapper around the sheet (The 'Deep Darkness') */}
            <div className="max-w-7xl mx-auto my-8 p-4 md:p-8 relative z-10 shadow-2xl skew-y-1" style={{ backgroundColor: '#1a1a1a' }}>
                {/* Reset skew for content */}
                <div className="-skew-y-1">

                    {/* HEAD: Persistent Stats */}
                    <header className="mb-10 bg-[#ffe900] p-6 shadow-[8px_8px_0_0_rgba(0,0,0,1)] border-2 border-black relative text-black">
                        {/* Corner decoration */}
                        <div className="absolute top-0 right-0 p-2 font-mono text-[10px] bg-black text-white font-bold">
                            DEATH IS CERTAIN
                        </div>

                        <div className="flex flex-col md:flex-row gap-8 items-start justify-between">

                            {/* Profile & Name */}
                            <div className="flex gap-6 items-center flex-1">
                                <div className="relative">
                                    <img src={actor.img} className="w-32 h-32 object-cover border-4 border-black shadow-lg grayscale hover:grayscale-0 transition-all duration-500" alt="Character Portrait" />
                                    <div className="absolute -bottom-3 -right-3 bg-black text-white px-2 py-1 font-mono text-xs transform -rotate-3 font-bold">
                                        {actor.type}
                                    </div>
                                </div>
                                <div>
                                    <h1 className={`${fell.className} text-6xl md:text-7xl font-bold uppercase tracking-tighter leading-none mb-2 drop-shadow-md`}>
                                        {actor.name}
                                    </h1>
                                    <div className="font-mono text-sm bg-black text-white inline-block px-2 py-1 transform rotate-1 font-bold">
                                        {actor.system?.class?.name || (actor.system?.biography ? 'Scum' : 'Unknown')}
                                    </div>
                                </div>
                            </div>

                            {/* Core Vitality Stats */}
                            <div className="flex gap-4 self-center md:self-auto bg-white/50 p-3 border border-black shadow-inner">
                                <StatBlock label="HP" value={actor.computed.currentHp} max={actor.computed.maxHp} path="system.hp.value" onUpdate={onUpdate} />
                                <StatBlock label="Omens" value={actor.computed.omens.value} max={actor.computed.omens.max} path="system.omens.value" onUpdate={onUpdate} />
                                <StatBlock label="Powers" value={actor.computed.powers.value} max={actor.computed.powers.max} path="system.powerUses.value" onUpdate={onUpdate} />
                            </div>

                            {/* Abilities Vertical Stack */}
                            <div className="flex flex-col gap-2 border-l-4 border-black pl-6 py-2">
                                <AbilityBlock label="Strength" value={actor.computed.abilities.strength.value} path="strength" onRoll={onRoll} />
                                <AbilityBlock label="Agility" value={actor.computed.abilities.agility.value} path="agility" onRoll={onRoll} />
                                <AbilityBlock label="Presence" value={actor.computed.abilities.presence.value} path="presence" onRoll={onRoll} />
                                <AbilityBlock label="Toughness" value={actor.computed.abilities.toughness.value} path="toughness" onRoll={onRoll} />
                            </div>
                        </div>
                    </header>

                    {/* CONTENT AREA - Revert to Yellow */}
                    <main className="bg-[#ffe900] p-4 md:p-8 border-2 border-black shadow-[10px_10px_0_0_#111] min-h-[600px] relative pb-24 text-black">
                        {/* Inner texture/noise for paper feel */}
                        <div className="absolute inset-0 bg-neutral-900/5 pointer-events-none mix-blend-multiply"></div>

                        <div className="relative z-10">
                            {activeTab === 'background' && <BackgroundTab actor={actor} onUpdate={onUpdate} />}
                            {activeTab === 'equipment' && <EquipmentTab actor={actor} onUpdate={onUpdate} onDeleteItem={onDeleteItem} />}
                            {activeTab === 'violence' && <ViolenceTab actor={actor} onRoll={onRoll} onUpdate={onUpdate} />}
                            {activeTab === 'special' && <SpecialTab actor={actor} onRoll={onRoll} />}
                        </div>
                    </main>

                    {/* Footer Fluff */}
                    <div className="mt-8 text-center opacity-30 invert pointer-events-none select-none pb-20">
                        {/* <img src="/morkborg_logo_footer.png" className="h-16 mx-auto opacity-50" alt="Mork Borg Logo" /> */}
                    </div>
                </div>

                {/* UNIFIED BOTTOM NAVIGATION */}
                <nav className="fixed bottom-0 left-0 right-0 bg-black border-t-4 border-[#ffe900] flex justify-center gap-2 md:gap-8 px-2 pt-3 pb-6 z-50 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
                    {['background', 'equipment', 'violence', 'special'].map((tab: any) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                flex flex-col items-center justify-center w-20 md:w-32 py-1 transition-transform active:scale-95
                                ${activeTab === tab ? 'text-[#ffe900] -translate-y-1' : 'text-neutral-500 hover:text-neutral-300'}
                            `}
                        >
                            <div className={`${fell.className} uppercase font-bold tracking-widest text-xs md:text-sm mb-1`}>{tab}</div>
                            <div className={`h-1 w-8 ${activeTab === tab ? 'bg-[#ffe900] shadow-[0_0_8px_#ffe900]' : 'bg-transparent'}`}></div>
                        </button>
                    ))}
                </nav>
            </div>
        </div>
    );
}
