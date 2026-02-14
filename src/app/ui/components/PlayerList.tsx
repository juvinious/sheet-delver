'use client';

import { useState, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';

interface UserDetail {
    id: string;
    name: string;
    isGM: boolean;
    active: boolean;
    color: string;
    characterName?: string;
}

import { useFoundry } from '@/app/ui/context/FoundryContext';

export default function PlayerList() {
    const { users, currentUser, handleLogout } = useFoundry();
    const currentUserId = currentUser?._id || currentUser?.id || null;
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click Outside Handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    if (!users || users.length === 0) return null;

    const activeCount = users.filter(u => u.active).length;

    // Split Users
    const gamemasters = users.filter(u => u.isGM);
    const players = users.filter(u => !u.isGM);

    const activeGMCount = gamemasters.filter(u => u.active).length;
    const activePlayerCount = players.filter(u => u.active).length;

    const renderUserRow = (u: any) => {
        const isSelf = (u._id || u.id) === currentUserId;
        const shouldHighlight = isSelf;

        return (
            <li key={u._id || u.id || u.name} className={`flex items-center gap-2 px-2 py-1.5 rounded transition-all ${u.active ? 'opacity-100' : 'opacity-40'} ${shouldHighlight ? 'ring-1 ring-white/20 bg-white/10' : ''}`}>
                <div
                    className={`w-2.5 h-2.5 rounded-full ring-2 ring-black/50 ${shouldHighlight ? 'ring-white/30' : ''}`}
                    style={{ backgroundColor: u.color, boxShadow: u.active ? `0 0 8px ${u.color}` : 'none' }}
                />
                <div className="flex flex-col leading-tight min-w-0">
                    <span className={`text-sm font-bold flex items-center gap-1.5 truncate ${shouldHighlight ? 'text-white' : 'text-neutral-200'}`}>
                        {u.name}
                        {u.isGM && <span className="text-[8px] bg-amber-600/90 text-black px-1 rounded-sm font-black tracking-tighter">GM</span>}
                    </span>
                    {u.characterName && (
                        <span className="text-[10px] text-neutral-500 truncate">{u.characterName}</span>
                    )}
                </div>
            </li>
        );
    };

    return (
        <div ref={containerRef} className="fixed bottom-6 left-6 z-[110] flex flex-col items-start gap-4">

            {/* List Popup */}
            <div className={`
                bg-black/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl overflow-hidden
                transition-all duration-300 origin-bottom-left flex flex-col
                ${isOpen ? 'w-[240px] opacity-100 scale-100 mb-0 translate-y-0' : 'w-[0px] h-[0px] opacity-0 scale-90 -mb-10 translate-y-10'}
            `}>
                {/* Header */}
                <div className="bg-neutral-900/50 p-2 border-b border-white/5 flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 pl-1">
                        Participants ({activeCount}/{users.length})
                    </span>
                    <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-white px-2">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[60vh] p-2 space-y-4">

                    {/* Players Section */}
                    {players.length > 0 && (
                        <div>
                            <div className="text-[10px] font-black text-neutral-500 mb-1 px-1 tracking-widest flex justify-between uppercase">
                                <span>Players</span>
                                <span>{activePlayerCount}/{players.length}</span>
                            </div>
                            <ul className="space-y-1">
                                {players.map(renderUserRow)}
                            </ul>
                        </div>
                    )}

                    {/* Gamemasters Section - Moved Below */}
                    {gamemasters.length > 0 && (
                        <div className={players.length > 0 ? "pt-2 border-t border-white/5" : ""}>
                            <div className="text-[10px] font-black text-amber-500/50 mb-1 px-1 tracking-widest flex justify-between uppercase mt-2">
                                <span>Gamemasters</span>
                                <span>{activeGMCount}/{gamemasters.length}</span>
                            </div>
                            <ul className="space-y-1">
                                {gamemasters.map(renderUserRow)}
                            </ul>
                        </div>
                    )}

                </div>

                <div className="p-2 border-t border-white/5 bg-black/20">
                    <button
                        onClick={handleLogout}
                        className="w-full text-xs bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-900/50 rounded py-1.5 transition-colors font-bold uppercase tracking-wider"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    h-12 w-12 rounded-full shadow-xl flex items-center justify-center border border-white/10 backdrop-blur-sm
                    transition-all duration-300 hover:scale-110 active:scale-95 group z-50
                    ${isOpen ? 'bg-neutral-800 text-white rotate-90 border-amber-500/50' : 'bg-black/60 text-neutral-400 hover:text-white hover:bg-black/80'}
                `}
                title="Toggle Player List"
            >
                {isOpen ? (
                    <div className="-rotate-90">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                ) : (
                    <div className="relative">
                        <Users className="w-5 h-5" />
                        {/* Active Count Badge */}
                        <span className="absolute -top-2 -right-2 bg-green-600 text-white text-[9px] font-bold h-4 w-4 flex items-center justify-center rounded-full ring-2 ring-black">
                            {activeCount}
                        </span>
                    </div>
                )}
            </button>
        </div>
    );
}
