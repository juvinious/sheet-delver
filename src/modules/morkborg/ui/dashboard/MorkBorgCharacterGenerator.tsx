'use client';

import React, { useState, useCallback } from 'react';
import { IM_Fell_Double_Pica, Inter } from 'next/font/google';
import grunge from './assets/grunge.png';
import { mbDataManager } from '../../data/DataManager';
import { logger } from '@/core/logger';

const fell = IM_Fell_Double_Pica({ weight: '400', subsets: ['latin'] });
const inter = Inter({ subsets: ['latin'] });

function randomTheme(currentTheme: any) {
    const themes = [
        {
            name: 'Classic',
            colors: {
                background: '#ffe900',
                text: '#000000',
                accent: '#ffffff',
                rgba: 'rgba(0, 0, 0, 0.5)',
                tailwind: {
                    background: 'bg-yellow',
                    backgroundAccent: 'bg-white',
                    text: 'text-black',
                    accent: 'white',
                }
            },
        },
        {
            name: 'DarkWhite',
            colors: {
                background: '#000000',
                text: '#ffffff',
                accent: '#ffe900',
                rgba: 'rgba(255, 255, 255, 0.5)',
                tailwind: {
                    background: 'bg-black',
                    backgroundAccent: 'bg-yellow-500',
                    text: 'text-white',
                    accent: 'yellow',
                }
            },
        },
        {
            name: 'DarkPink',
            colors: {
                background: '#000000',
                text: '#ffffff',
                accent: '#ff00ff',
                rgba: 'rgba(255, 255, 255, 0.5)',
                tailwind: {
                    background: 'bg-black',
                    backgroundAccent: 'bg-pink-500',
                    text: 'text-white',
                    accent: 'pink',
                }
            },
        },
        {
            name: 'Dark',
            colors: {
                background: '#000000',
                text: '#ffffff',
                accent: 'gray',
                rgba: 'rgba(255, 255, 255, 0.5)',
                tailwind: {
                    background: 'bg-black',
                    backgroundAccent: 'bg-gray-500',
                    text: 'text-white',
                    accent: 'gray',
                }
            },
        },
        {
            name: 'Pink',
            colors: {
                background: '#ff00ff',
                text: '#ffffff',
                accent: 'yellow',
                rgba: 'rgba(0, 0, 0, 0.5)',
                tailwind: {
                    background: 'bg-pink',
                    backgroundAccent: 'bg-yellow-500',
                    text: 'text-white',
                    accent: 'yellow',
                }
            },
        },
    ];

    const availableThemes = currentTheme?.name
        ? themes.filter(t => t.name !== currentTheme.name)
        : themes;

    return availableThemes[Math.floor(Math.random() * availableThemes.length)];
}

function randomRotation() {
    const flip = Math.floor(Math.random() * 2) === 0 ? '' : '-';
    return `${flip}rotate-${Math.floor(Math.random() * 2) + 1}`;
}

function randomName() {
    return mbDataManager.drawFromTable('characterNames').name;
}

function randomCharacter(includeZeroLevel: boolean, previousClassId?: string) {
    const character = mbDataManager.generateRandomCharacter(includeZeroLevel, previousClassId);
    return character;
}

async function createCharacter(character: any) {
    try {
        const actorData = {
            name: character.name,
            type: 'character',
            img: character.class.img,
            system: {
                abilities: character.abilities,
                description: character.class.system.description,
                hp: character.hp,
                miseries: { min: 0, max: 4, value: 0 },
                omens: character.omens,
                powerUses: character.powers,
                notes: character.classNotes
            },
            items: character.items
        };

        // 3. Send to API

        const headers: any = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('sheet-delver-token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/actors', {
            method: 'POST',
            headers,
            body: JSON.stringify(actorData)
        });

        const result = await res.json();
        if (result.success) {
            // Redirect to sheet - Wait 500ms for backend stabilization
            setTimeout(() => {
                window.location.href = `/actors/${result.id}`;
            }, 500);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        logger.error('Error creating character:', error);
        //setCreationError('Creation Failed: ' + error);
        //setLoading(false);
        setTimeout(() => {
            //window.location.reload();
        }, 1000);
    }
}

export default function MorkBorgCharacterGenerator() {
    const [theme, setTheme] = useState(randomTheme({}));
    const [includeZeroLevel, setIncludeZeroLevel] = useState(false); // Move state declaration up
    const [character, setCharacter] = useState(() => randomCharacter(false));
    return (
        <div className={`min-h-screen text-[#111] ${inter.className} selection:bg-pink-500 selection:text-white`} suppressHydrationWarning>

            {/* Randomly selected theme background */}
            <div className="fixed inset-0 -z-50" style={{ backgroundColor: theme.colors.background }}>
            </div>

            {/* Top Navigation Bar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-neutral-900 border-b border-neutral-800 px-4 py-3 shadow-md flex items-center justify-between backdrop-blur-sm bg-opacity-95">
                <button
                    onClick={() => window.location.href = '/'}
                    className="flex items-center gap-2 text-neutral-400 hover:text-amber-500 transition-colors font-semibold group text-sm uppercase tracking-wide"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    Back to Dashboard
                </button>
                <div className="text-xs text-neutral-600 font-mono hidden md:block">
                    Generating New Character
                </div>
            </nav>


            {/* Main Header (Subheader) - Controls & Title */}
            <div className={`${theme.colors.tailwind.background} ${theme.colors.tailwind.text} shadow-md sticky top-[45px] z-10 flex items-center justify-between px-6 border-b-4 border-[${theme.colors.accent}] h-24 mt-[45px]`}>
                <div className="flex items-center gap-6">
                    <div className={`w-16 h-16 bg-${theme.colors.tailwind.background} border-2 border-[${theme.colors.accent}] flex items-center justify-center rounded`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 ${theme.colors.tailwind.text}`}>
                            <path d="M5.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM2.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM18.75 7.5a.75.75 0 00-1.5 0v2.25H15a.75.75 0 000 1.5h2.25v2.25a.75.75 0 001.5 0v-2.25H21a.75.75 0 000-1.5h-2.25V7.5z" />
                        </svg>
                    </div>
                    <div className="py-2">
                        <h1 className={`text-3xl ${theme.colors.tailwind.text} font-serif font-bold leading-none tracking-tight`}>Create Character</h1>
                        <p className={`${theme.colors.tailwind.text} text-xs font-sans tracking-widest uppercase mt-1`}>
                            MÖRK BORG
                        </p>
                    </div>
                </div>

                <div className="flex gap-6 items-center pr-2">
                    <div>
                        <label className="flex items-center gap-2">
                            Include Zero Level
                            <input
                                type="checkbox"
                                checked={includeZeroLevel}
                                onChange={(e) => {
                                    setIncludeZeroLevel(e.target.checked);
                                    if (!e.target.checked && character?.class?.name === 'Adventurer') {
                                        setTheme(randomTheme(theme));
                                        setCharacter(randomCharacter(includeZeroLevel));
                                    }
                                }}
                            />
                        </label>
                    </div>
                    {/* Randomize Button */}
                    <button
                        onClick={() => {
                            setTheme(randomTheme(theme));
                            setCharacter(randomCharacter(includeZeroLevel, character?.class?._id));
                        }}
                        className="group relative flex items-center justify-center -mb-2"
                        title="Randomize All"
                    >
                        <div className={`w-14 h-14 flex items-center justify-center transition-transform group-hover:scale-110 bg-neutral-800 rounded-full border-2 border-[${theme.colors.accent}] group-hover:border-[${theme.colors.accent}] shadow-lg`}>
                            <img src="/icons/dice-d20.svg" alt="Randomize" className={`w-12 h-12 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_8px_rgba(${theme.colors.rgba},0.8)]`} />
                        </div>
                    </button>
                </div>
            </div>

            {character && (
                <div className="flex-1 px-4 max-w-7xl mx-auto w-full pt-6 mb-20 space-y-8">
                    <div className={`grid grid-cols-4 gap-5 text-center ${theme.colors.tailwind.text} p-2`}>
                        <div className={`border-4 border-[${theme.colors.accent}] ${theme.colors.tailwind.backgroundAccent} font-bold text-2xl p-2 ${randomRotation()} shadow-[15px_15px_0_0_${theme.colors.rgba}]`}>
                            <div>Name</div>
                            <div>{character.name}</div>
                        </div>
                        <div className={`border-4 border-[${theme.colors.accent}] ${theme.colors.tailwind.backgroundAccent} font-bold text-2xl p-2 ${randomRotation()} shadow-[15px_15px_0_0_${theme.colors.rgba}]`}>
                            <div>Class</div>
                            <div>{character.class?.name}</div>
                        </div>
                        <div className={`border-4 border-[${theme.colors.accent}] ${theme.colors.tailwind.backgroundAccent} font-bold text-2xl p-2 ${randomRotation()} shadow-[15px_15px_0_0_${theme.colors.rgba}]`}>
                            <div>HP</div>
                            <div>{character.hp?.max}</div>
                        </div>
                        <div className={`border-4 border-[${theme.colors.accent}] ${theme.colors.tailwind.backgroundAccent} font-bold text-2xl p-2 ${randomRotation()} shadow-[15px_15px_0_0_${theme.colors.rgba}]`}>
                            <div>Omens</div>
                            <div>{character.omens?.max}</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className={`${theme.colors.tailwind.text} border-4 border-[${theme.colors.accent}] p-2 ${randomRotation()} mt-4 flex flex-col shadow-[15px_15px_0_0_rgba(0,0,0,0.5)]`}>
                            <div className={`text-2xl font-bold`}>
                                <h3 className={`${theme.colors.tailwind.backgroundAccent} p-2`}>{character.name}</h3>
                            </div>
                            <div className={`text-sm font-bold uppercase tracking-widest mt-2 p-2`}>{character.class?.name || 'Classless'}</div>
                            <div className={`mt-1 leading-relaxed flex-1 p-2`}>
                                {character.class?.system?.description && <div className="mb-2 italic" dangerouslySetInnerHTML={{ __html: character.class.system.description }} />}
                                {character.traits && <div className="mb-2">{character.traits}</div>}
                                {character.classNotes && <div className="whitespace-pre-line">{character.classNotes}</div>}
                            </div>
                        </div>
                        <div className={`${theme.colors.tailwind.text} border-4 border-[${theme.colors.accent}] p-2 ${randomRotation()} mt-4 flex flex-col shadow-[15px_15px_0_0_rgba(0,0,0,0.5)]`}>
                            <div className={`text-2xl font-bold ${theme.colors.tailwind.backgroundAccent} p-2`}>Class</div>
                            <div className={`text-sm uppercase tracking-widest flex-1 space-y-4 overflow-y-auto p-2`}>
                                {character.items?.filter((i: any) => i.type === 'feat' || i.type === 'power').map((feat: any) => (
                                    <div key={feat._id} className="mb-2">
                                        <div className="font-bold border-b border-black font-sans tracking-widest">{feat.name}</div>
                                        <div className="mt-1 normal-case tracking-normal leading-relaxed" dangerouslySetInnerHTML={{ __html: feat.system?.description || '' }} />
                                    </div>
                                ))}
                                {character.items?.filter((i: any) => i.type === 'feat' || i.type === 'power').length === 0 && (
                                    <div className="italic">None</div>
                                )}
                            </div>
                        </div>
                        <div className={`${theme.colors.tailwind.text} border-4 border-[${theme.colors.accent}] p-2 ${randomRotation()} mt-4 shadow-[15px_15px_0_0_rgba(0,0,0,0.5)]`}>
                            <div className={`text-2xl font-bold ${theme.colors.tailwind.backgroundAccent} p-2`}>Abilities</div>
                            <div className={`text-sm font-bold uppercase tracking-widest p-2`}>
                                <ul className="list-none space-y-2">
                                    <li className="flex justify-between"><span>Strength</span> <span>{character.abilities?.strength.value > 0 ? '+' : ''}{character.abilities?.strength.value}</span></li>
                                    <li className="flex justify-between"><span>Agility</span> <span>{character.abilities?.agility.value > 0 ? '+' : ''}{character.abilities?.agility.value}</span></li>
                                    <li className="flex justify-between"><span>Presence</span> <span>{character.abilities?.presence.value > 0 ? '+' : ''}{character.abilities?.presence.value}</span></li>
                                    <li className="flex justify-between"><span>Toughness</span> <span>{character.abilities?.toughness.value > 0 ? '+' : ''}{character.abilities?.toughness.value}</span></li>
                                </ul>
                            </div>
                        </div>
                        <div className={`${theme.colors.tailwind.text} border-4 border-[${theme.colors.accent}] p-2 ${randomRotation()} mt-4 shadow-[15px_15px_0_0_rgba(0,0,0,0.5)]`}>
                            <div className={`text-2xl font-bold ${theme.colors.tailwind.backgroundAccent} p-2`}>Equipment</div>
                            <div className={`text-sm font-bold uppercase tracking-widest p-2`}>
                                <div className={`mb-2 border-b border-[${theme.colors.accent}] p-2 text-right`}>
                                    {character.silver} Silver Pieces
                                </div>
                                <ul className="list-none space-y-1">
                                    {character.items?.filter((i: any) => !['feat', 'power'].includes(i.type)).map((item: any, idx: number) => (
                                        item.name.toLowerCase() !== 'nothing' ? <li key={`${item.name}-${idx}`} className="flex justify-between items-center group">
                                            <span>{item.name}</span>
                                            {item.system?.quantity > 1 && <span className="ml-2">x{item.system.quantity}</span>}
                                        </li> : ''
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div>
                        <button className={`w-full mt-4 p-4 text-4xl ${theme.colors.tailwind.backgroundAccent} ${theme.colors.tailwind.text} border-4 border-[${theme.colors.accent}] cursor-pointer shadow-[15px_15px_0_0_rgba(0,0,0,0.5)] ${randomRotation()}`}
                            onClick={() => {
                                //console.log(character);
                                createCharacter(character);
                            }}
                        >
                            SAVE THIS ONE
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}