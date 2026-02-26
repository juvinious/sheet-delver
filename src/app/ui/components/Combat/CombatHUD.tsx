'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFoundry, Combat, Combatant } from '@/app/ui/context/FoundryContext';
import { Swords, Skull, Shield, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

export default function CombatHUD() {
    const { combats, step } = useFoundry();
    const [selectedCombatIndex, setSelectedCombatIndex] = useState(0);
    const [isMinimized, setIsMinimized] = useState(false);

    // Hide if not fully in game
    if (['init', 'setup', 'authenticating', 'login', 'startup', 'initializing'].includes(step)) return null;

    // Filter to active combats that have started (round > 0)
    const activeCombats = combats?.filter(c => ((c as any).scene !== null || (c as any).active === true) && (c as any).round > 0) || [];

    if (activeCombats.length === 0) return null;

    // Safety bounds for selected index
    const activeCombat = activeCombats[Math.min(selectedCombatIndex, activeCombats.length - 1)];

    // Derive sorted combatants for the queue
    const sortedCombatants = [...(activeCombat?.combatants || [])].sort((a: any, b: any) => {
        const ia = typeof a.initiative === 'number' && !isNaN(a.initiative) ? a.initiative : -Infinity;
        const ib = typeof b.initiative === 'number' && !isNaN(b.initiative) ? b.initiative : -Infinity;
        return (ib - ia) || ((a._id || a.id) > (b._id || b.id) ? 1 : -1);
    });

    const currentTurnIndex = activeCombat?.turn ?? 0;

    // Get the name of current actor
    const currentActorName = sortedCombatants[currentTurnIndex]?.actor?.name || 'Unknown';

    // To create a continuous carousel, we slice the array into two parts:
    // 1. Those who haven't acted yet (current turn to end)
    // 2. Those who have acted (start to current turn)
    // We then insert a special "Divider" element between them
    const unacted = sortedCombatants.slice(currentTurnIndex);
    const acted = sortedCombatants.slice(0, currentTurnIndex);

    // Construct the final visual array
    const carouselItems = [
        ...unacted,
        { isDivider: true, id: 'round-divider' },
        ...acted
    ];

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] pointer-events-auto flex flex-col items-center gap-2">

            {/* Multiple Combats Selector */}
            {activeCombats.length > 1 && !isMinimized && (
                <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-lg text-xs font-medium text-white/70">
                    <button
                        onClick={() => setSelectedCombatIndex(prev => Math.max(0, prev - 1))}
                        disabled={selectedCombatIndex === 0}
                        className="p-1 hover:text-white disabled:opacity-30 disabled:hover:text-white/70 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>Encounter {selectedCombatIndex + 1} of {activeCombats.length}</span>
                    <button
                        onClick={() => setSelectedCombatIndex(prev => Math.min(activeCombats.length - 1, prev + 1))}
                        disabled={selectedCombatIndex === activeCombats.length - 1}
                        className="p-1 hover:text-white disabled:opacity-30 disabled:hover:text-white/70 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Minimized Bubble */}
            {isMinimized ? (
                <button
                    onClick={() => setIsMinimized(false)}
                    className="flex flex-col items-center gap-1 bg-black/90 backdrop-blur-2xl px-4 py-2 rounded-2xl border border-white/20 shadow-2xl hover:bg-neutral-900 transition-all duration-300 group"
                >
                    <div className="text-xs font-medium text-white/80">
                        <span className="text-maroon-400 font-bold">Round {activeCombat?.round || 1}</span> - {currentActorName}
                    </div>
                    <ChevronDown className="w-6 h-6 text-white group-hover:text-white transition-transform" />
                </button>
            ) : (
                /* Main Initiative Queue */
                <div className="relative flex flex-col items-center group">
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="absolute top-1 left-1/2 -translate-x-1/2 z-10 w-10 h-5 flex items-center justify-center bg-black/90 rounded-full hover:bg-neutral-800 "
                    >
                        <ChevronUp className="w-15 h-15 text-white/60" />
                    </button>
                    <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 pt-6 pb-4 rounded-3xl bg-black/95 backdrop-blur-2xl border border-white/20 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] transition-all duration-500">

                        {/* Queue Container */}
                        <div className="flex items-center gap-x-2 overflow-x-auto scrollbar-hide max-w-[85vw] pt-3 px-1">
                            {carouselItems.map((item: any, visualIdx: number) => {
                                // Render the Round Divider
                                if (item.isDivider) {
                                    return (
                                        <div key={item.id} className="flex flex-col items-center justify-center mx-1 px-1 h-20 sm:h-24 relative">
                                            <div className="w-[2px] h-full bg-white/20 rounded-full"></div>
                                            <div className="absolute top-1/2 left-1 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-black/90 border border-white/20 flex items-center justify-center shadow-md">
                                                <span className="text-[10px] font-bold text-white/40">
                                                    {activeCombat ? activeCombat.round + 1 : 2}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }

                                const combatant = item;
                                const originalIndex = sortedCombatants.findIndex(c => c._id === combatant._id);
                                const isCurrentTurn = originalIndex === currentTurnIndex;
                                const hasActed = originalIndex < currentTurnIndex;
                                const isDefeated = combatant.defeated || (combatant.actor?.system?.attributes?.hp?.value <= 0) || combatant.actor?.derived?.currentHp <= 0;

                                return (
                                    <div
                                        key={combatant._id || visualIdx}
                                        className={`relative flex flex-col items-center flex-shrink-0 transition-all duration-500 origin-bottom
                                            ${isCurrentTurn ? 'scale-110 z-10 mx-2 w-20 sm:w-24' : 'scale-95 opacity-80 hover:opacity-100 w-14 sm:w-16'}
                                            ${hasActed ? 'opacity-40 grayscale-[70%]' : ''}
                                        `}
                                    >
                                        {/* Current Turn Indicator Arrow */}
                                        {isCurrentTurn && (
                                            <div className="absolute animate-bounce flex flex-col items-center z-20 hidden">
                                                <div className="w-3 h-3 bg-rose-800 rotate-45 transform origin-bottom border-t border-l border-rose-600 shadow-[0_-5px_15px_rgba(159,18,57,0.5)]"></div>
                                            </div>
                                        )}

                                        {/* Portrait Container */}
                                        <div className={`
                                            w-full h-20 sm:h-24 rounded-t-full overflow-hidden border-[3px] shadow-lg relative bg-neutral-900 flex items-center justify-center transition-all duration-300
                                            ${isCurrentTurn ? 'border-rose-800 shadow-[0_0_20px_rgba(159,18,57,0.7)] ring-2 ring-rose-900/50' : 'border-neutral-700 hover:border-neutral-500'}
                                            ${isDefeated ? 'border-red-950/50 grayscale opacity-60' : ''}
                                        `}>
                                            {/*
                                            {!combatant.hidden && (
                                                <div className="absolute top-0 w-full bg-gradient-to-b from-black/90 to-transparent pt-1 pb-3 px-1 z-10 flex justify-center">
                                                    <span className={`truncate text-[9px] sm:text-[10px] font-bold drop-shadow-md
                                                        ${isCurrentTurn ? 'text-white' : 'text-white/80'}
                                                        ${isDefeated ? 'line-through decoration-red-600 decoration-2 text-white/50' : ''}
                                                    `}>
                                                        {combatant.actor?.name?.split(' ')[0] || 'Unknown'}
                                                    </span>
                                                </div>
                                            )}
                                                */}

                                            {/*{combatant.actor?.img && combatant.actor.img !== 'icons/svg/mystery-man.svg' ? (*/}
                                            {!combatant.hidden && combatant.actor?.img && combatant.actor.img !== 'icons/svg/mystery-man.svg' ? (
                                                <img
                                                    src={combatant.actor?.img}
                                                    alt={combatant.actor?.name || 'Combatant'}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Shield className="w-10 h-10 text-neutral-600" />
                                            )}

                                            {/* Defeated Overlay */}
                                            {isDefeated && (
                                                <>
                                                    <div className="absolute inset-0 bg-red-950/40 backdrop-blur-[1px]"></div>
                                                    <div className="absolute bottom-1 right-1 z-10 bg-black/60 rounded-full p-0.5 border border-red-900/50">
                                                        <Skull className="w-3 h-3 sm:w-4 sm:h-4 text-red-700 drop-shadow-[0_0_5px_rgba(0,0,0,1)]" />
                                                    </div>
                                                </>
                                            )}

                                            {/* Initiative Badge */}
                                            {/*}
                                            <div className={`
                                                absolute -bottom-1 left-1/2 -translate-x-1/2
                                                px-3 py-[2px] rounded-md text-[11px] font-black font-mono shadow-md border
                                                ${isCurrentTurn ? 'bg-rose-800 text-white border-rose-600' : 'bg-neutral-800 text-white border-neutral-600'}
                                            `}>
                                                {typeof combatant.initiative === 'number' && !isNaN(combatant.initiative) ? combatant.initiative : '?'}
                                            </div>
                                            */}
                                            <div className={
                                                `absolute bottom-0 flex items-center justify-center w-full h-auto
                                                ${isCurrentTurn ? 'bg-rose-800 text-white border-rose-600' : 'bg-neutral-800 text-white border-neutral-600'}
                                            `}>
                                                <span className={`text-[11px] font-black font-mono shadow-md ${combatant.defeated ? 'line-through decoration-red-600 decoration-2' : ''}`}>
                                                    {!combatant.hidden ? combatant.actor?.name?.split(' ')[0] || 'Unknown' : 'Hidden'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Floating Round Indicator Pill */}
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-black/95 border border-white/20 rounded-full w-10 h-10 flex items-center justify-center shadow-xl z-[160]">
                        <span className="text-3xl font-serif text-rose-600 drop-shadow-md -translate-y-1">
                            {activeCombat?.round || 1}
                        </span>
                    </div>

                </div>
            )}
        </div>
    );
}
