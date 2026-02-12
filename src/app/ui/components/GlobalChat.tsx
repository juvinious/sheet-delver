
import { useState, useRef, useEffect } from 'react';
import ChatTab from './ChatTab';
import DiceTray from './DiceTray';
import { Inter } from 'next/font/google';
import { MessageSquare } from 'lucide-react';
import { SystemAdapter, RollMode } from '@/shared/interfaces';

const inter = Inter({ subsets: ['latin'] });

interface GlobalChatProps {
    messages: any[];
    onSend: (msg: string, options?: { rollMode?: RollMode; speaker?: string }) => void;
    onRoll?: (type: string, key: string, options?: { rollMode?: RollMode; speaker?: string }) => void;
    foundryUrl?: string;
    adapter?: SystemAdapter;
    hideDice?: boolean;
    speaker?: string;
    // Controlled props for Dice Tray
    isDiceTrayOpen?: boolean;
    onToggleDiceTray?: () => void;
}

export default function GlobalChat(props: GlobalChatProps) {
    const {
        messages,
        onSend,
        onRoll,
        foundryUrl,
        adapter,
        hideDice,
        isDiceTrayOpen,
        onToggleDiceTray
    } = props;
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isDiceOpenLocal, setIsDiceOpenLocal] = useState(false);

    const s = adapter?.componentStyles?.globalChat || {
        window: "bg-neutral-900/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-xl",
        header: "flex justify-between items-center bg-white/10 p-3 border-b border-white/10",
        title: "text-[10px] font-bold uppercase text-white/60 pl-2 tracking-widest",
        diceWindow: "w-[400px]",
        chatWindow: "w-[400px] h-[80vh]",
        toggleBtn: (isOpen: boolean, isDice?: boolean) => `
            h-12 w-12 rounded-full shadow-lg flex items-center justify-center
            transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10
            ${isDice
                ? (isOpen ? 'bg-white/10 text-white rotate-90' : 'bg-neutral-800 text-white hover:bg-neutral-700')
                : (isOpen ? 'bg-white/10 text-white rotate-90' : 'bg-amber-500 text-black hover:bg-amber-400')
            }
        `,
        closeBtn: "text-white/40 hover:text-white transition-colors"
    };

    // Use controlled state if provided, otherwise local
    const isDiceOpen = props.isDiceTrayOpen ?? isDiceOpenLocal;

    const toggleDice = () => {
        if (onToggleDiceTray) {
            onToggleDiceTray();
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
        <div ref={containerRef} className={`fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none ${inter.className} `}>

            {/* --- WINDOWS --- */}
            <div className="flex flex-col-reverse items-end gap-4 pointer-events-none">

                {/* Dice Window (Conditional) */}
                {!props.hideDice && (
                    <div className={`
                        ${s.window}
                        w-[calc(100vw-2rem)] max-w-[400px]
                        transition-all duration-300 origin-bottom-right
                        ${isDiceOpen
                            ? 'opacity-100 scale-100 pointer-events-auto'
                            : 'opacity-0 scale-95 pointer-events-none h-0'
                        }
                    `}>
                        {isDiceOpen && (
                            <>
                                <div className={s.header || "flex justify-between items-center bg-white/5 p-3 border-b border-white/5"}>
                                    <span className={s.title || "text-[10px] font-bold uppercase text-white/40 pl-2 tracking-widest"}>Dice Tray</span>
                                    <button onClick={toggleDice} className={`${s.closeBtn} px-2`}>✕</button>
                                </div>
                                <div className="p-0">
                                    <DiceTray
                                        onSend={(msg, options) => { onSend(msg, { ...options, speaker: options?.speaker || props.speaker }); toggleDice(); }}
                                        adapter={adapter}
                                        hideHeader={true}
                                        speaker={props.speaker}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Chat Window */}
                <div className={`
                    ${s.window}
                    ${s.chatWindow}
                    flex flex-col
                    transition-all duration-300 origin-bottom-right
                    ${isChatOpen
                        ? 'opacity-100 scale-100 pointer-events-auto'
                        : 'opacity-0 scale-95 pointer-events-none h-0'}
                `}>
                    <div className={`${s.header || "flex justify-between items-center bg-white/5 p-3 border-b border-white/5"} flex-none`}>
                        <span className={s.title || "text-[10px] font-bold uppercase text-white/40 pl-2 tracking-widest"}>
                            Game Chat {messages && messages.length > 0 && `(${messages.length})`}
                        </span>
                        <button onClick={() => setIsChatOpen(false)} className={`${s.closeBtn} px-2`}>✕</button>
                    </div>
                    <div className={`flex-1 min-h-0 ${!isChatOpen ? 'hidden' : ''}`}>
                        {/* Hide Dice Tray inside ChatTab since we have a separate window OR if globally hidden */}
                        <ChatTab
                            messages={messages || []}
                            onSend={onSend}
                            foundryUrl={foundryUrl}
                            adapter={adapter}
                            hideDiceTray={true}
                            hideHeader={true}
                            speaker={props.speaker}
                        />
                    </div>
                </div>

            </div>


            {/* --- BUTTONS --- */}
            <div className="flex gap-3 items-center pointer-events-auto">

                {/* Dice Toggle */}
                {!hideDice && (
                    <button
                        onClick={() => {
                            if (!isDiceOpen) setIsChatOpen(false);
                            toggleDice();
                        }}
                        className={`
                            group h-12 w-12 rounded-full shadow-lg flex items-center justify-center
                            transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10
                            ${isDiceOpen ? 'bg-white/10 text-white rotate-90' : 'bg-neutral-900 text-white hover:bg-black'}
                        `}
                        title="Toggle Dice Tray"
                    >
                        {isDiceOpen ? (
                            <svg className="w-6 h-6 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        ) : (
                            <img
                                src="/icons/dice-d20.svg"
                                alt="Dice"
                                className="w-10 h-10 brightness-0 invert transition-all group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
                            />
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
                        h-14 w-14 rounded-full shadow-lg flex items-center justify-center
                        transition-all duration-300 hover:scale-110 active:scale-95 border border-white/10
                        ${isChatOpen ? 'bg-white/10 text-white rotate-90' : 'bg-amber-500 text-black hover:bg-amber-400'}
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
