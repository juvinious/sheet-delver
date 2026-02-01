
import { useState, useRef, useEffect } from 'react';
import ChatTab from './ChatTab';
import DiceTray from './DiceTray';
import { Inter } from 'next/font/google';
import { MessageSquare } from 'lucide-react';
import { SystemAdapter } from '../modules/core/interfaces';

const inter = Inter({ subsets: ['latin'] });

interface GlobalChatProps {
    messages: any[];
    onSend: (msg: string) => void;
    onRoll?: (type: string, key: string) => void;
    foundryUrl?: string;
    adapter?: SystemAdapter;
    hideDice?: boolean;
    // Controlled props for Dice Tray
    isDiceTrayOpen?: boolean;
    onToggleDiceTray?: () => void;
}

export default function GlobalChat(props: GlobalChatProps) {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isDiceOpenLocal, setIsDiceOpenLocal] = useState(false);

    // Use controlled state if provided, otherwise local
    const isDiceOpen = props.isDiceTrayOpen ?? isDiceOpenLocal;

    const toggleDice = () => {
        if (props.onToggleDiceTray) {
            props.onToggleDiceTray();
        } else {
            setIsDiceOpenLocal(!isDiceOpenLocal);
        }
    };

    const containerRef = useRef<HTMLDivElement>(null);

    // Click Outside Handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // Ignore clicks on the toggle button itself to prevent double-toggling
                if ((event.target as Element).closest('.dice-tray-toggle')) return;

                // Only close if we are actually open
                if (isChatOpen) setIsChatOpen(false);

                // Close controlled or local
                if (isDiceOpen) {
                    if (props.onToggleDiceTray) {
                        // Only close if it's open
                        if (props.isDiceTrayOpen) props.onToggleDiceTray();
                    } else {
                        setIsDiceOpenLocal(false);
                    }
                }
            }
        };

        if (isChatOpen || isDiceOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isChatOpen, isDiceOpen, props]);

    return (
        <div ref={containerRef} className={`fixed bottom - 6 right - 6 z - [100] flex flex - col items - end gap - 4 pointer - events - none ${inter.className} `}>

            {/* --- WINDOWS --- */}
            <div className="absolute bottom-20 right-0 flex gap-4 pointer-events-none">

                {/* Dice Window (Conditional) */}
                {!props.hideDice && (
                    <div className={`
pointer - events - auto
bg - zinc - 950 border border - zinc - 800 shadow - 2xl rounded - lg overflow - hidden
transition - all duration - 300 origin - bottom sm: origin - bottom - right
                        ${isDiceOpen
                            ? 'fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-[400px] h-auto opacity-100 scale-100 pointer-events-auto sm:translate-x-0 sm:static sm:w-[400px]'
                            : 'fixed bottom-24 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-[400px] opacity-0 scale-90 pointer-events-none sm:translate-x-0 sm:static sm:w-[0px] sm:h-[0px]'
                        }
`}>
                        <div className="flex justify-between items-center bg-zinc-900 p-2 border-b border-zinc-800">
                            <span className="text-xs font-bold uppercase text-zinc-500 pl-2 tracking-wider">Dice Tray</span>
                            <button onClick={toggleDice} className="text-zinc-500 hover:text-white px-2">✕</button>
                        </div>
                        <div>
                            <DiceTray onSend={(msg) => { props.onSend(msg); toggleDice(); }} adapter={props.adapter} />
                        </div>
                    </div>
                )}

                {/* Chat Window */}
                <div className={`
pointer - events - auto
bg - zinc - 950 border border - zinc - 800 shadow - 2xl rounded - lg overflow - hidden
transition - all duration - 300 origin - bottom - right flex flex - col
                    ${isChatOpen ? 'w-[350px] h-[500px] opacity-100 scale-100' : 'w-[0px] h-[0px] opacity-0 scale-90'}
`}>
                    <div className="flex justify-between items-center bg-zinc-900 p-2 border-b border-zinc-800 flex-none">
                        <span className="text-xs font-bold uppercase text-zinc-500 pl-2 tracking-wider">
                            Game Chat {props.messages.length > 0 && `(${props.messages.length})`}
                        </span>
                        <button onClick={() => setIsChatOpen(false)} className="text-zinc-500 hover:text-white px-2">✕</button>
                    </div>
                    <div className="flex-1 min-h-0 pb-2">
                        {/* Hide Dice Tray inside ChatTab since we have a separate window OR if globally hidden */}
                        <ChatTab {...props} adapter={props.adapter} hideDiceTray={true} />
                    </div>
                </div>

            </div>


            {/* --- BUTTONS --- */}
            <div className="flex gap-3 items-center pointer-events-auto">

                {/* Dice Toggle */}
                {!props.hideDice && (
                    <button
                        onClick={() => {
                            if (!isDiceOpen) setIsChatOpen(false);
                            toggleDice();
                        }}
                        className={`
                            group h - 12 w - 12 rounded - full shadow - lg flex items - center justify - center
transition - all duration - 300 hover: scale - 110 active: scale - 95
                            ${isDiceOpen ? 'bg-zinc-700 text-white rotate-90' : 'bg-indigo-600 text-white hover:bg-indigo-500'}
`}
                        title="Toggle Dice Tray"
                    >
                        {isDiceOpen ? (
                            <svg className="w-6 h-6 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <img src="/icons/dice-d20.svg" alt="Dice" className="w-8 h-8 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                        )}
                    </button>
                )}

                {/* Chat Toggle */}
                <button
                    onClick={() => {
                        if (!isChatOpen && isDiceOpen) toggleDice();
                        setIsChatOpen(!isChatOpen);
                    }}
                    className={`
h - 14 w - 14 rounded - full shadow - lg flex items - center justify - center
transition - all duration - 300 hover: scale - 110 active: scale - 95
                        ${isChatOpen ? 'bg-zinc-700 text-white rotate-90' : 'bg-amber-600 text-white hover:bg-amber-500'}
`}
                    title="Toggle Chat"
                >
                    {isChatOpen ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <MessageSquare className="w-6 h-6" />
                    )}
                </button>
            </div>

        </div>
    );
}
