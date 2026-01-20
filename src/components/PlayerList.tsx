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

export default function PlayerList() {
    const [users, setUsers] = useState<UserDetail[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users');
            const data = await res.json();
            if (data.users) {
                setUsers(data.users);
            }
        } catch {
            // Silent error
        }
    };

    useEffect(() => {
        fetchUsers();
        const interval = setInterval(fetchUsers, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

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

    if (users.length === 0) return null;

    const activeCount = users.filter(u => u.active).length;

    return (
        <div ref={containerRef} className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-4">

            {/* List Popup */}
            <div className={`
                bg-black/90 backdrop-blur-md rounded-lg border border-white/10 shadow-2xl overflow-hidden
                transition-all duration-300 origin-bottom-left
                ${isOpen ? 'w-[220px] opacity-100 scale-100 mb-0' : 'w-[0px] h-[0px] opacity-0 scale-90 -mb-10'}
            `}>
                <div className="bg-neutral-900/50 p-2 border-b border-white/5 flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 pl-1">
                        Players ({activeCount}/{users.length})
                    </span>
                    <button onClick={() => setIsOpen(false)} className="text-neutral-500 hover:text-white px-2">✕</button>
                </div>

                <ul className="p-2 space-y-1">
                    {users.map(u => (
                        <li key={u.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${u.active ? 'opacity-100 bg-white/5' : 'opacity-40'}`}>
                            <div
                                className="w-2.5 h-2.5 rounded-full ring-2 ring-black/50"
                                style={{ backgroundColor: u.color, boxShadow: u.active ? `0 0 8px ${u.color}` : 'none' }}
                            />
                            <div className="flex flex-col leading-tight min-w-0">
                                <span className="text-sm font-bold text-neutral-200 flex items-center gap-1.5 truncate">
                                    {u.name}
                                    {u.isGM && <span className="text-[8px] bg-amber-600/90 text-black px-1 rounded-sm font-black tracking-tighter">GM</span>}
                                </span>
                                {u.characterName && (
                                    <span className="text-[10px] text-neutral-500 truncate">{u.characterName}</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    h-12 w-12 rounded-full shadow-lg flex items-center justify-center border border-white/10
                    transition-all duration-300 hover:scale-110 active:scale-95 group
                    ${isOpen ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800'}
                `}
                title="Toggle Player List"
            >
                <div className="relative">
                    <Users className="w-5 h-5" />
                    {/* Active Count Badge */}
                    <span className="absolute -top-2 -right-2 bg-green-600 text-white text-[9px] font-bold h-4 w-4 flex items-center justify-center rounded-full ring-2 ring-black">
                        {activeCount}
                    </span>
                </div>
            </button>
        </div>
    );
}
