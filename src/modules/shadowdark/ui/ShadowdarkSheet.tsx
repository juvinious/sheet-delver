'use client';

import { useState, useEffect } from 'react';
import RollDialog from '@/components/RollDialog';
import { Crimson_Pro, Inter } from 'next/font/google';
import { resolveImage, resolveEntityName } from './sheet-utils';

// Sub-components
import InventoryTab from './InventoryTab';
import SpellsTab from './SpellsTab';
import TalentsTab from './TalentsTab';
import AbilitiesTab from './AbilitiesTab';
import DetailsTab from './DetailsTab';
import EffectsTab from './EffectsTab';
import NotesTab from './NotesTab';
import BottomNavigation from './BottomNavigation';

// Typography
const crimson = Crimson_Pro({ subsets: ['latin'], variable: '--font-crimson' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });


interface ShadowdarkSheetProps {
    actor: any;
    foundryUrl?: string;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onDeleteItem?: (itemId: string) => void;
    onToggleDiceTray?: () => void;
}

export default function ShadowdarkSheet({ actor, foundryUrl, onRoll, onUpdate, onToggleEffect, onDeleteEffect, onDeleteItem, onToggleDiceTray }: ShadowdarkSheetProps) {
    const [activeTab, setActiveTab] = useState('details');
    const [systemData, setSystemData] = useState<any>(null);

    const [rollDialog, setRollDialog] = useState<{
        open: boolean;
        title: string;
        type: 'attack' | 'ability' | 'spell';
        defaults: any;
        callback: ((options: any) => void) | null;
    }>({
        open: false,
        title: '',
        type: 'attack',
        defaults: {},
        callback: null
    });

    const triggerRollDialog = (type: string, key: string) => {
        let dialogType: 'attack' | 'ability' | 'spell' = 'attack';
        let title = '';
        const defaults: any = {};

        if (type === 'ability') {
            dialogType = 'ability';
            title = `${key.toUpperCase().replace('ABILITY', '')} Ability Check`; // e.g. "STR Ability Check"
            // Find mod
            const stat = actor.stats?.[key] || {};
            defaults.abilityBonus = stat.mod || 0;
        } else if (type === 'item') {
            // Find item
            const item = actor.items?.find((i: any) => i.id === key);
            if (item) {
                if (item.type === 'Spell') {
                    dialogType = 'spell';
                    title = `Cast Spell: ${item.name}`;
                    const statKey = item.system?.ability || 'int';
                    const stat = actor.stats?.[statKey] || {};
                    defaults.abilityBonus = stat.mod || 0;
                    defaults.talentBonus = 0; // TODO list
                    defaults.showItemBonus = false; // Hide Item Bonus for known spells
                } else {
                    dialogType = 'attack';
                    title = `Roll Attack with ${item.name}`;
                    // Attempt to pre-calculate bonuses
                    const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                    const isRanged = item.system?.type === 'ranged'; // Only force DEX if explicitly a ranged weapon

                    const str = actor.stats?.str?.mod || actor.stats?.STR?.mod || 0;
                    const dex = actor.stats?.dex?.mod || actor.stats?.DEX?.mod || 0;

                    let statBonus = str;
                    if (isRanged) statBonus = dex;
                    else if (isFinesse) statBonus = Math.max(str, dex);

                    defaults.abilityBonus = statBonus;
                    defaults.itemBonus = item.system?.bonuses?.attackBonus || 0;
                }
            }
        }

        setRollDialog({
            open: true,
            title,
            type: dialogType,
            defaults,
            callback: (options) => {
                onRoll(type, key, options); // Pass options back up
            }
        });
    };

    useEffect(() => {
        fetch('/api/system/data')
            .then(res => res.json())
            .then(data => setSystemData(data))
            .catch(err => console.error('Failed to fetch system data:', err));
    }, []);


    const tabs = ['details', 'abilities', 'spells', 'inventory', 'talents', 'notes', 'effects'];

    return (
        <div className={`flex flex-col h-full relative pb-24 md:pb-0 ${crimson.variable} ${inter.variable} font-sans bg-neutral-100 text-black`}>
            {/* Header / Top Nav */}
            <div className="bg-neutral-900 text-white shadow-md sticky top-0 z-10 flex items-stretch justify-between mb-6 border-b-4 border-black h-24">
                <div className="flex items-center gap-6">
                    <img
                        src={resolveImage(actor.img, foundryUrl)}
                        alt={actor.name}
                        className="h-full w-24 object-cover border-r-2 border-white/10 bg-neutral-800"
                    />
                    <div className="py-2">
                        <h1 className="text-3xl font-serif font-bold leading-none tracking-tight">{actor.name}</h1>
                        <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                            {resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries')} {resolveEntityName(actor.system?.class, actor, systemData, 'classes')} {actor.system?.level?.value !== undefined ? `Level ${actor.system.level.value}` : ''}
                        </p>
                    </div>
                </div>
                {/* Stats Summary */}
                <div className="flex gap-6 items-center pr-6">

                    {actor.computed?.levelUp && (
                        <span className="bg-amber-500 text-black px-3 py-1 text-sm font-bold rounded animate-pulse shadow-lg ring-2 ring-amber-400/50">
                            LEVEL UP!
                        </span>
                    )}
                    {actor.system?.attributes?.hp && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">HP</span>
                            <div className="flex items-center gap-1 font-serif font-bold text-2xl">
                                <input
                                    key={actor.system.attributes.hp.value} // Force remount to sync when other tabs update it
                                    type="number"
                                    defaultValue={actor.system.attributes.hp.value}
                                    onBlur={(e) => {
                                        let val = parseInt(e.target.value);
                                        const max = actor.computed?.maxHp || 1;
                                        // Enforce Max HP Cap
                                        if (val > max) val = max;
                                        // Reset input display if it was capped
                                        if (val !== parseInt(e.target.value)) e.target.value = val.toString();

                                        if (val !== actor.system.attributes.hp.value) onUpdate('system.attributes.hp.value', val);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    className="w-12 text-center bg-transparent border-b border-neutral-300 hover:border-black focus:border-amber-500 outline-none transition-colors"
                                />
                                <span className="opacity-50">/</span>
                                <span>{actor.computed?.maxHp ?? actor.system.attributes.hp.max}</span>
                            </div>
                        </div>
                    )}
                    {(actor.computed?.ac !== undefined) && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">AC</span>
                            <span className="font-serif font-bold text-2xl">{actor.computed.ac}</span>
                        </div>
                    )}

                    {/* Dice Tray Button */}
                    <button
                        onClick={() => onToggleDiceTray?.()}
                        className="flex flex-col items-center group -mb-1"
                        title="Open Dice Tray"
                    >
                        <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest group-hover:text-amber-500 transition-colors">Roll</span>
                        <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-110">
                            <svg viewBox="0 0 100 100" className="w-full h-full fill-current text-white group-hover:text-amber-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]">
                                <path d="M50 5 L93 25 L93 75 L50 95 L7 75 L7 25 Z" stroke="currentColor" strokeWidth="4" fill="none" />
                                <text x="50" y="62" fontSize="35" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none" style={{ fontFamily: 'var(--font-cinzel), serif' }}>20</text>
                            </svg>
                        </div>
                    </button>
                </div>
            </div>

            {/* Tabs (Hidden on Mobile) */}
            <div className="hidden md:flex border-b-2 border-black bg-white overflow-x-auto mb-6 mx-4">
                {
                    tabs.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`min-w-[80px] shrink-0 py-2 text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-4 border-r border-black last:border-r-0 ${activeTab === tab ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-200'}`}
                        >
                            {tab}
                        </button>
                    ))
                }
            </div>

            {/* Content Area */}
            <div className="flex-1 px-4 max-w-5xl mx-auto w-full">

                {activeTab === 'details' && (
                    <DetailsTab
                        actor={actor}
                        systemData={systemData}
                        onUpdate={onUpdate}
                        foundryUrl={foundryUrl}
                    />
                )
                }

                {
                    activeTab === 'abilities' && (
                        <AbilitiesTab
                            actor={actor}
                            onUpdate={onUpdate}
                            triggerRollDialog={triggerRollDialog}
                        />
                    )
                }

                {
                    activeTab === 'spells' && (
                        <SpellsTab
                            actor={actor}
                            onUpdate={onUpdate}
                            triggerRollDialog={triggerRollDialog}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                        />
                    )
                }

                {
                    activeTab === 'talents' && (
                        <TalentsTab
                            actor={actor}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                        />
                    )
                }

                {
                    activeTab === 'inventory' && (
                        <InventoryTab
                            actor={actor}
                            onUpdate={onUpdate}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                            onDeleteItem={onDeleteItem}
                        />
                    )
                }

                {
                    activeTab === 'notes' && (
                        <NotesTab
                            actor={actor}
                            onUpdate={onUpdate}
                        />
                    )
                }

                {
                    activeTab === 'effects' && (
                        <EffectsTab
                            actor={actor}
                            foundryUrl={foundryUrl}
                            onToggleEffect={onToggleEffect}
                            onDeleteEffect={onDeleteEffect}
                        />
                    )
                }

                {/* Debug Data Card */}
                {(actor.debugLevel ?? 0) >= 4 && (
                    <div className="mt-20 border-t border-neutral-200 pt-4">
                        <details className="text-xs font-mono text-neutral-400">
                            <summary className="cursor-pointer mb-2">Debug Data</summary>
                            <pre className="bg-neutral-100 p-4 overflow-auto rounded">{JSON.stringify(actor, null, 2)}</pre>
                        </details>
                    </div>
                )}
            </div >

            <RollDialog
                isOpen={rollDialog.open}
                title={rollDialog.title}
                type={rollDialog.type}
                defaults={rollDialog.defaults}
                onConfirm={(options) => {
                    if (rollDialog.callback) rollDialog.callback(options);
                    setRollDialog(prev => ({ ...prev, open: false }));
                }}
                onClose={() => setRollDialog(prev => ({ ...prev, open: false }))}
            />



            {/* Mobile Bottom Navigation */}
            <div className="md:hidden">
                <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
        </div >
    );
}
