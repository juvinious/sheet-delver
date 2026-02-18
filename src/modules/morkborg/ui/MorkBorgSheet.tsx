'use client';

import React, { useState } from 'react';
import { IM_Fell_Double_Pica, Inter } from 'next/font/google';
import grunge from './assets/grunge.png';
import BackgroundTab from './BackgroundTab';
import EquipmentTab from './EquipmentTab';
import ViolenceTab from './ViolenceTab';
import SpecialTab from './SpecialTab';

const fell = IM_Fell_Double_Pica({ weight: '400', subsets: ['latin'] });
const inter = Inter({ subsets: ['latin'] });

interface MorkBorgSheetProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onDeleteItem: (itemId: string) => void;
    onCreateItem?: (itemData: any) => void;
    onUpdateItem?: (itemData: any) => void;
    onToggleDiceTray?: () => void;
    isDiceTrayOpen?: boolean;
}

const StatBlock = ({ label, value, path, max, onUpdate }: { label: string, value: any, path: string, max?: any, onUpdate: any }) => (
    <div className="flex flex-col items-center justify-center w-full bg-black/80 p-2 border border-neutral-700 relative">
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
        <span className={`${fell.className} text-pink-500 text-sm uppercase tracking-widest mb-1`}>{label}</span>
        <div className="flex items-center gap-1 font-mono text-2xl text-white">
            <input
                type="number"
                value={value}
                onChange={(e) => onUpdate(path, Number(e.target.value))}
                className="bg-transparent w-20 text-center focus:outline-none focus:text-pink-500"
            />
            {max !== undefined && (
                <>
                    <span className="text-neutral-500">/</span>
                    <input
                        type="number"
                        value={max}
                        readOnly
                        className="bg-transparent w-20 text-center text-neutral-500 focus:outline-none"
                    />
                </>
            )}
        </div>
    </div>
);

const AbilityBlock = ({ label, value, onRoll }: { label: string, value: number, onRoll: any }) => (
    <div className="flex items-center gap-4 group cursor-pointer" onClick={() => onRoll('ability', label.toLowerCase())}>
        <div className={`${fell.className} text-3xl w-12 text-right group-hover:text-pink-500 transition-colors`}>
            {label.substring(0, 3)}
        </div>
        <div className={`${fell.className} text-4xl font-bold bg-black text-white w-14 h-14 flex items-center justify-center border-2 border-transparent group-hover:border-pink-500 transition-all shadow-md transform group-hover:scale-110`}>
            {value > 0 ? `+${value}` : value}
        </div>
    </div>
);

export default function MorkBorgSheet({ actor, onRoll, onUpdate, onDeleteItem }: MorkBorgSheetProps) {
    const [activeTab, setActiveTab] = useState<'background' | 'equipment' | 'violence' | 'special'>('violence');

    // Safety check
    if (!actor) return null;

    // Map categorized items to expected structure for tabs
    const sheetActor = {
        ...actor,
        items: actor.categorizedItems || {
            weapons: [],
            armor: [],
            equipment: [],
            scrolls: [],
            abilities: []
        },
        derived: actor.derived || {
            currentHp: 0,
            maxHp: 1,
            omens: { value: 0, max: 0 },
            powers: { value: 0, max: 0 },
            abilities: {},
            slotsUsed: 0,
            maxSlots: 10,
            encumbered: false,
            silver: 0
        }
    };

    return (
        <div className={`min-h-screen text-[#111] ${inter.className} selection:bg-pink-500 selection:text-white`} suppressHydrationWarning>
            {/* Global Yellow Background Force */}
            <div className="fixed inset-0 -z-50" style={{ backgroundColor: '#ffe900' }}></div>

            {/* Texture Overlay - Global */}
            <div className="fixed inset-0 pointer-events-none opacity-5 mix-blend-overlay z-40" style={{ backgroundImage: `url(${grunge.src})` }}></div>

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

                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
                                {/* Profile & Name */}
                                <div className="flex gap-6 items-center flex-1">
                                    <div className="relative">
                                        <img
                                            src={encodeURI(sheetActor.img)}
                                            className="block object-cover border-4 border-black shadow-lg grayscale hover:grayscale-0 transition-all duration-500"
                                            style={{ width: '128px', height: '128px', minWidth: '128px' }}
                                            alt="Character Portrait"
                                            onError={(e) => {
                                                console.error('Image failed to load:', sheetActor.img);
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                        <div className="absolute -bottom-3 -right-3 bg-black text-white px-2 py-1 font-mono text-xs transform -rotate-3 font-bold">
                                            {sheetActor.derived?.class?.name}
                                        </div>
                                    </div>
                                    <div>
                                        <h1 className={`${fell.className} text-6xl md:text-7xl font-bold uppercase tracking-tighter leading-none mb-2 drop-shadow-md`}>
                                            {sheetActor.name}
                                        </h1>
                                        <div className="font-mono text-sm bg-black text-white inline-block px-2 py-1 transform rotate-1 font-bold">
                                            {sheetActor.derived?.class?.description || (sheetActor.system?.biography ? 'Scum' : 'Unknown')}
                                        </div>
                                    </div>
                                </div>

                                {/* Abilities Vertical Stack - Now Top Right */}
                                <div className="flex flex-col gap-2 border-l-4 border-black pl-6 py-2">
                                    <AbilityBlock label="Strength" value={sheetActor.derived.abilities?.strength?.value ?? 0} onRoll={onRoll} />
                                    <AbilityBlock label="Agility" value={sheetActor.derived.abilities?.agility?.value ?? 0} onRoll={onRoll} />
                                    <AbilityBlock label="Presence" value={sheetActor.derived.abilities?.presence?.value ?? 0} onRoll={onRoll} />
                                    <AbilityBlock label="Toughness" value={sheetActor.derived.abilities?.toughness?.value ?? 0} onRoll={onRoll} />
                                </div>
                            </div>

                            {/* Core Vitality Stats - Now in separate row below */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white/50 p-3 border border-black shadow-inner w-full">
                                <StatBlock label="HP" value={sheetActor.derived.currentHp} max={sheetActor.derived.maxHp} path="system.hp.value" onUpdate={onUpdate} />
                                <StatBlock label="Omens" value={sheetActor.derived.omens.value} max={sheetActor.derived.omens.max} path="system.omens.value" onUpdate={onUpdate} />
                                <StatBlock label="Powers" value={sheetActor.derived.powers.value} max={sheetActor.derived.powers.max} path="system.powerUses.value" onUpdate={onUpdate} />
                                <StatBlock label="Silver" value={sheetActor.derived.silver} path="system.silver" onUpdate={onUpdate} />
                            </div>
                        </div>
                    </header>

                    {/* CONTENT AREA - Revert to Yellow */}
                    <main className="bg-[#ffe900] p-4 md:p-8 border-2 border-black shadow-[10px_10px_0_0_#111] min-h-[600px] relative pb-24 text-black">
                        {/* Inner texture/noise for paper feel */}
                        <div className="absolute inset-0 bg-neutral-900/5 pointer-events-none mix-blend-multiply"></div>

                        <div className="relative z-10">
                            {activeTab === 'background' && <BackgroundTab actor={sheetActor} onUpdate={onUpdate} />}
                            {activeTab === 'equipment' && <EquipmentTab actor={sheetActor} onUpdate={onUpdate} onDeleteItem={onDeleteItem} />}
                            {activeTab === 'violence' && <ViolenceTab actor={sheetActor} onRoll={onRoll} onUpdate={onUpdate} />}
                            {activeTab === 'special' && <SpecialTab actor={sheetActor} onRoll={onRoll} />}
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
