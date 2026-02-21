'use client';

import React, { useState } from 'react';
import { IM_Fell_Double_Pica, Inter } from 'next/font/google';
import grunge from './assets/grunge.png';
import BackgroundTab from './BackgroundTab';
import EquipmentTab from './EquipmentTab';
import ViolenceTab from './ViolenceTab';
import SpecialTab from './SpecialTab';
import RestModal from './components/RestModal';

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

const StatBlock = ({ label, value, path, max, min = 0, showMax = true, onUpdate }: { label: string, value: any, path: string, max?: any, min?: number, showMax?: boolean, onUpdate: any }) => (
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
                onChange={(e) => {
                    let val = Number(e.target.value);
                    if (min !== undefined) val = Math.max(min, val);
                    if (max !== undefined) val = Math.min(max, val);
                    onUpdate(path, val);
                }}
                className="bg-transparent w-20 text-center focus:outline-none focus:text-pink-500"
            />
            {max !== undefined && showMax && (
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
    <div className="flex items-center gap-2 sm:gap-4 group cursor-pointer justify-center md:justify-end" onClick={() => onRoll('ability', label.toLowerCase())}>
        <div className={`${fell.className} text-2xl sm:text-3xl w-12 sm:w-16 text-right group-hover:text-pink-500 transition-colors`}>
            {label.substring(0, 3).toUpperCase()}
        </div>
        <div className={`${fell.className} text-3xl sm:text-4xl font-bold bg-black text-white w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center border-2 border-transparent group-hover:border-pink-500 transition-all shadow-md transform group-hover:scale-110`}>
            {value > 0 ? `+${value}` : value}
        </div>
    </div>
);

export default function MorkBorgSheet({ actor, onRoll, onUpdate, onDeleteItem }: MorkBorgSheetProps) {
    const [activeTab, setActiveTab] = useState<'background' | 'equipment' | 'violence' | 'special'>('violence');
    const [isRestModalOpen, setIsRestModalOpen] = useState(false);

    const navItems = [
        { id: 'background', label: 'BACKGROUND', rotate: '-rotate-2', color: 'bg-neutral-900' },
        { id: 'equipment', label: 'EQUIPMENT', rotate: 'rotate-1', color: 'bg-black' },
        { id: 'violence', label: 'VIOLENCE', rotate: '-rotate-1', color: 'bg-neutral-800' },
        { id: 'special', label: 'SPECIAL', rotate: 'rotate-2', color: 'bg-black' }
    ];

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
            uncategorized: []
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
                                {/* Profile & Name Section */}
                                <div className="flex flex-col gap-6 flex-1 w-full order-first">
                                    <div className="flex gap-4 sm:gap-6 items-center">
                                        <div className="relative flex-shrink-0">
                                            <img
                                                src={encodeURI(sheetActor.img)}
                                                className="block object-cover border-4 border-black shadow-lg w-24 h-24 sm:w-32 sm:h-32 min-w-[96px] sm:min-w-[128px]"
                                                alt="Character Portrait"
                                                onError={(e) => {
                                                    console.error('Image failed to load:', sheetActor.img);
                                                    e.currentTarget.style.display = 'none';
                                                }}
                                            />
                                            <div className="absolute -bottom-3 -right-3 bg-black text-white px-2 py-1 font-mono text-[10px] sm:text-xs transform -rotate-3 font-bold z-10">
                                                {sheetActor.derived?.class?.name}
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <h1 className={`${fell.className} text-4xl sm:text-6xl md:text-7xl font-bold uppercase tracking-tighter leading-[0.85] sm:leading-none mb-1 drop-shadow-md break-words`}>
                                                {sheetActor.name}
                                            </h1>
                                        </div>
                                    </div>

                                    {/* Description/Bio with restored tilt */}
                                    <div className="font-mono text-sm bg-black text-white p-4 transform rotate-1 font-bold shadow-lg border-l-4 border-pink-500 md:max-w-2xl">
                                        <div className="mb-1 text-pink-500 uppercase text-[10px] tracking-widest">{sheetActor.derived?.class?.name || 'SCUM'}</div>
                                        <div className="leading-tight">
                                            {sheetActor.derived?.class?.description || (sheetActor.system?.biography ? 'A lowly wretch surviving in a dying world.' : 'Unknown wretch.')}
                                        </div>
                                    </div>
                                </div>

                                {/* Abilities - Now below name and description on mobile */}
                                <div className="w-full md:w-auto">
                                    <div className="grid grid-cols-2 md:flex md:flex-col gap-x-4 gap-y-2 border-t-4 md:border-t-0 md:border-l-4 border-black pt-6 md:pt-0 md:pl-6 py-2">
                                        <AbilityBlock label="Strength" value={sheetActor.derived.abilities?.strength?.value ?? 0} onRoll={onRoll} />
                                        <AbilityBlock label="Agility" value={sheetActor.derived.abilities?.agility?.value ?? 0} onRoll={onRoll} />
                                        <AbilityBlock label="Presence" value={sheetActor.derived.abilities?.presence?.value ?? 0} onRoll={onRoll} />
                                        <AbilityBlock label="Toughness" value={sheetActor.derived.abilities?.toughness?.value ?? 0} onRoll={onRoll} />
                                    </div>
                                </div>
                            </div>

                            {/* Core Vitality Stats - Now in separate row below */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white/50 p-3 border border-black shadow-inner w-full">
                                <StatBlock label="HP" value={sheetActor.derived.currentHp} max={sheetActor.derived.maxHp} path="system.hp.value" onUpdate={onUpdate} />
                                <div className="group cursor-pointer" onClick={() => onRoll('spendOmen', 'spend')}>
                                    <StatBlock label="Omens" value={sheetActor.derived.omens.value} max={sheetActor.derived.omens.max} showMax={false} path="system.omens.value" onUpdate={onUpdate} />
                                    <div className="absolute top-1 right-2 text-[8px] font-mono text-pink-600 opacity-0 group-hover:opacity-100 transition-opacity">SPEND</div>
                                </div>
                                <StatBlock label="Powers" value={sheetActor.derived.powers.value} max={sheetActor.derived.powers.max} showMax={false} path="system.powerUses.value" onUpdate={onUpdate} />
                                <StatBlock label="Silver" value={sheetActor.derived.silver} path="system.silver" onUpdate={onUpdate} />
                            </div>

                            {/* Automated Actions - Funky Tabs Style */}
                            <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
                                <button
                                    onClick={() => setIsRestModalOpen(true)}
                                    className={`${fell.className} bg-neutral-900 text-white px-4 py-1 text-sm border-2 border-black -rotate-1 shadow-[4px_4px_0_0_#000] hover:bg-pink-600 hover:text-white transition-all active:scale-95`}
                                >
                                    REST
                                </button>
                                <button
                                    onClick={() => onRoll('getBetter', 'getBetter')}
                                    className={`${fell.className} bg-black text-white px-4 py-1 text-sm border-2 border-black rotate-1 shadow-[4px_4px_0_0_#000] hover:bg-pink-600 hover:text-white transition-all active:scale-95`}
                                >
                                    GET BETTER
                                </button>
                                <button
                                    onClick={() => onRoll('broken', 'broken')}
                                    className={`${fell.className} bg-neutral-800 text-white px-4 py-1 text-sm border-2 border-black -rotate-2 shadow-[4px_4px_0_0_#000] hover:bg-red-600 hover:text-white transition-all active:scale-95`}
                                >
                                    BROKEN
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* CONTENT AREA - Revert to Yellow */}
                    <main className="bg-[#ffe900] p-4 md:p-8 border-2 border-black shadow-[10px_10px_0_0_#111] min-h-[600px] relative pb-24 text-black">
                        {/* Inner texture/noise for paper feel */}
                        <div className="absolute inset-0 bg-neutral-900/5 pointer-events-none mix-blend-multiply"></div>

                        <div className="relative z-10">
                            {activeTab === 'background' && <BackgroundTab actor={sheetActor} onUpdate={onUpdate} />}
                            {activeTab === 'equipment' && <EquipmentTab actor={sheetActor} onRoll={onRoll} onUpdate={onUpdate} onDeleteItem={onDeleteItem} />}
                            {activeTab === 'violence' && <ViolenceTab actor={sheetActor} onRoll={onRoll} onUpdate={onUpdate} />}
                            {activeTab === 'special' && <SpecialTab actor={sheetActor} onRoll={onRoll} onUpdate={onUpdate} onDeleteItem={onDeleteItem} />}
                        </div>
                    </main>

                    {/* Footer Fluff */}
                    <div className="mt-8 text-center opacity-30 invert pointer-events-none select-none">
                        {/* <img src="/morkborg_logo_footer.png" className="h-16 mx-auto opacity-50" alt="Mork Borg Logo" /> */}
                    </div>

                    {/* DESKTOP ONLY NAVIGATION - Inside the Sheet */}
                    <div className="hidden sm:flex justify-center gap-4 mt-8 pb-12">
                        {navItems.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`
                                        flex flex-col items-center justify-center 
                                        px-8 py-3 transition-all duration-200 active:scale-95
                                        border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                                        ${tab.rotate}
                                        ${isActive
                                            ? 'bg-pink-600 text-white border-black z-20 scale-110 sm:rotate-0'
                                            : `${tab.color} text-neutral-400 border-neutral-700 hover:border-pink-500 hover:text-pink-500 z-10`
                                        }
                                    `}
                                >
                                    <div className={`${fell.className} uppercase font-bold tracking-[0.2em] text-xl whitespace-nowrap`}>
                                        {tab.label}
                                    </div>
                                    {isActive && (
                                        <div className="h-1 w-full bg-white mt-1 shadow-[0_0_8px_#fff]"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* MOBILE ONLY NAVIGATION - Sticky Viewport */}
            <nav className="fixed sm:hidden bottom-0 left-0 right-0 z-50 pointer-events-none">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex flex-wrap justify-center gap-2 p-4 pb-24 pointer-events-none">
                        {navItems.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`
                                        pointer-events-auto
                                        flex flex-col items-center justify-center 
                                        px-4 py-2 transition-all duration-200 active:scale-95
                                        border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                                        ${tab.rotate}
                                        ${isActive
                                            ? 'bg-pink-600 text-white border-black z-20 scale-110'
                                            : `${tab.color} text-neutral-400 border-neutral-700 hover:border-pink-500 hover:text-pink-500 z-10`
                                        }
                                    `}
                                >
                                    <div className={`${fell.className} uppercase font-bold tracking-[0.2em] text-xs whitespace-nowrap`}>
                                        {tab.label}
                                    </div>
                                    {isActive && (
                                        <div className="h-1 w-full bg-white mt-1 shadow-[0_0_8px_#fff]"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </nav>

            <RestModal
                isOpen={isRestModalOpen}
                onClose={() => setIsRestModalOpen(false)}
                onRoll={onRoll}
                actor={sheetActor}
            />
        </div>
    );
}
