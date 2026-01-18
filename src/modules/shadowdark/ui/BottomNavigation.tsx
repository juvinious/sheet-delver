'use client';

import { User, Sword, Wand2, Backpack, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface BottomNavigationProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export default function BottomNavigation({ activeTab, setActiveTab }: BottomNavigationProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    const primaryTabs = [
        { id: 'details', label: 'Details', icon: User },
        { id: 'abilities', label: 'Combat', icon: Sword },
        { id: 'spells', label: 'Magic', icon: Wand2 },
        { id: 'inventory', label: 'Gear', icon: Backpack },
    ];

    const menuTabs = [
        { id: 'talents', label: 'Talents' },
        { id: 'notes', label: 'Notes' },
        { id: 'effects', label: 'Effects' },
        { id: 'chat', label: 'Chat' },
    ];

    const handleTabClick = (id: string) => {
        setActiveTab(id);
        setMenuOpen(false);
    };

    return (
        <>
            {/* Main Bottom Bar */}
            <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/90 backdrop-blur-md border-t border-neutral-200 flex items-center justify-around px-2 z-50 pb-safe">
                {primaryTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 ${isActive ? 'text-black scale-105' : 'text-neutral-400 hover:text-neutral-600'
                                }`}
                        >
                            <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-current' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-bold tracking-wide uppercase">{tab.label}</span>
                        </button>
                    );
                })}

                {/* Menu Button */}
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 ${menuOpen ? 'text-black scale-105' : 'text-neutral-400 hover:text-neutral-600'}`}
                >
                    <Menu className="w-6 h-6 mb-1" strokeWidth={2} />
                    <span className="text-[10px] font-bold tracking-wide uppercase">Menu</span>
                </button>
            </div>

            {/* Slide-up Menu Overlay */}
            {menuOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
                    <div
                        className="absolute bottom-24 right-4 bg-white rounded-2xl shadow-2xl p-4 w-48 border border-neutral-200 animate-in slide-in-from-bottom-10 fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-2 px-2 pb-2 border-b border-neutral-100">
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">More</span>
                            <button onClick={() => setMenuOpen(false)} className="text-neutral-400 hover:text-black">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                            {menuTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => handleTabClick(tab.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-colors ${activeTab === tab.id
                                        ? 'bg-black text-white'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
