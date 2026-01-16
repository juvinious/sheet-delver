'use client';

import DiceTray from './DiceTray';

interface ChatTabProps {
    messages: any[];
    onSend: (msg: string) => void;
    onRoll?: (type: string, key: string) => void;
    foundryUrl?: string;
    variant?: 'default' | 'shadowdark';
    hideDiceTray?: boolean;
}

const styles = {
    default: {
        container: "bg-zinc-950 rounded-lg border border-zinc-800 shadow-inner",
        header: "text-zinc-400 text-xs font-bold uppercase mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2 tracking-wider",
        msgContainer: (isRoll: boolean) => `p-3 rounded-md border text-sm ${isRoll ? 'bg-zinc-900/50 border-zinc-800' : 'bg-transparent border-t border-b border-zinc-800/50 border-l-0 border-r-0'}`,
        user: "font-bold text-amber-500 text-xs uppercase tracking-wide",
        time: "text-[10px] text-zinc-600 font-mono",
        flavor: "text-xs italic text-zinc-500 mb-1",
        content: "text-zinc-300 leading-relaxed messages-content [&_p]:mb-1 [&_img]:max-w-[48px] [&_img]:max-h-[48px] [&_img]:inline-block [&_img]:rounded [&_img]:border [&_img]:border-zinc-700",
        rollResult: "mt-2 bg-zinc-900 p-2 rounded text-center border border-zinc-800 font-mono",
        rollFormula: "text-[10px] text-zinc-500",
        rollTotal: "text-lg font-bold text-white",
        button: "inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-500/50 rounded px-2 py-0.5 text-[10px] font-bold text-zinc-300 transition-all cursor-pointer my-1 shadow-sm",
        buttonText: "text-zinc-400 uppercase",
        buttonValue: "text-amber-500"
    },
    shadowdark: {
        container: "bg-white border-2 border-black",
        header: "text-black text-sm font-bold uppercase mb-4 border-b-2 border-black pb-2 font-serif tracking-widest",
        msgContainer: (isRoll: boolean) => `p-3 border-2 border-black mb-2 shadow-sm ${isRoll ? 'bg-neutral-100' : 'bg-white'}`,
        user: "font-serif font-bold text-black text-lg",
        time: "text-[10px] uppercase font-bold text-neutral-400 tracking-widest",
        flavor: "text-sm italic text-neutral-600 mb-1 font-serif",
        content: "text-sm text-black font-serif leading-relaxed messages-content [&_img]:max-w-[48px] [&_img]:max-h-[48px] [&_img]:inline-block [&_img]:border-2 [&_img]:border-black [&_img]:grayscale [&_img]:contrast-125",
        rollResult: "mt-2 bg-white text-black p-2 text-center border-2 border-black",
        rollFormula: "text-[10px] uppercase tracking-widest text-neutral-500",
        rollTotal: "text-2xl font-bold font-serif",
        button: "inline-flex items-center gap-1 bg-white hover:bg-black group border-2 border-black px-2 py-0.5 text-xs font-bold text-black hover:text-white transition-colors cursor-pointer my-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none active:translate-y-[2px]",
        buttonText: "uppercase font-sans tracking-widest",
        buttonValue: "font-serif font-bold group-hover:text-white"
    }
};

export default function ChatTab({ messages, onSend, foundryUrl, onRoll, variant = 'default', hideDiceTray = false }: ChatTabProps) {
    const s = styles[variant] || styles.default;

    // Helper to format content content with fixed image URLs AND parsing inline checks
    const formatContent = (html: string) => {
        if (!html) return '';

        let fixed = html;

        // 1. Fix Image URLs
        if (foundryUrl) {
            fixed = fixed.replace(/src="([^"]+)"/g, (match, p1) => {
                if (p1.startsWith('http') || p1.startsWith('data:')) return match;
                const cleanUrl = foundryUrl.endsWith('/') ? foundryUrl : `${foundryUrl}/`;
                const cleanPath = p1.startsWith('/') ? p1.slice(1) : p1;
                return `src="${cleanUrl}${cleanPath}"`;
            });

            fixed = fixed.replace(/url\(([^)]+)\)/g, (match, p1) => {
                let path = p1.replace(/['"]/g, '');
                if (path.startsWith('http') || path.startsWith('data:')) return match;
                const cleanUrl = foundryUrl.endsWith('/') ? foundryUrl : `${foundryUrl}/`;
                const cleanPath = path.startsWith('/') ? path.slice(1) : path;
                return `url('${cleanUrl}${cleanPath}')`;
            });
        }

        // 2. UUID Links: @UUID[...]{Label} -> Label
        fixed = fixed.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');

        // 3. Parse Inline Checks: [[check 15 cha]] OR [[/r 1d20]]
        fixed = fixed.replace(/\[\[(.*?)\]\]/gi, (match, content) => {
            const clean = content.replace(/&nbsp;/g, ' ').trim();
            const lower = clean.toLowerCase();

            // Check
            const checkMatch = lower.match(/^check\s+(\d+)\s+(\w+)$/);
            if (checkMatch) {
                return `<button 
                    data-action="roll-check" 
                    data-dc="${checkMatch[1]}" 
                    data-stat="${checkMatch[2]}"
                    class="${s.button}"
                >
                    <span class="${s.buttonText}">${checkMatch[2]}</span>
                    <span class="${s.buttonValue}">DC ${checkMatch[1]}</span>
                </button>`;
            }

            // Roll Formula
            if (lower.startsWith('/r') || lower.startsWith('/roll')) {
                const formula = clean.replace(/^\/(r|roll)\s*/i, '').trim();
                return `<button 
                    data-action="roll-formula"
                    data-formula="${formula}"
                    class="${s.button}"
                >
                    <span class="${s.buttonText}">roll</span>
                    <span class="${s.buttonValue}">${formula}</span>
                </button>`;
            }

            return match;
        });

        return fixed;
    };

    const handleChatClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const button = target.closest('button[data-action]');

        if (button) {
            const action = button.getAttribute('data-action');

            if (action === 'roll-check' && onRoll) {
                const stat = button.getAttribute('data-stat');
                if (stat) {
                    onRoll('ability', stat);
                }
            } else if (action === 'roll-formula' && onSend) {
                const formula = button.getAttribute('data-formula');
                if (formula) {
                    onSend(`/roll ${formula}`);
                }
            }
        }
    };

    return (
        <div className="flex flex-col h-full gap-4">
            {/* Chat Log (Top) */}
            <div className={`flex-1 flex flex-col p-4 overflow-hidden ${s.container}`}>
                <h3 className={s.header}>Chat Log</h3>
                <div
                    className="flex-1 overflow-y-auto space-y-4 pr-2"
                    onClick={handleChatClick}
                >
                    {messages.map((msg) => (
                        <div key={msg.id} className={s.msgContainer(msg.isRoll)}>
                            <div className="flex justify-between items-center mb-1">
                                <span className={s.user}>{msg.user}</span>
                                <span className={s.time}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {msg.flavor && <div className={s.flavor}>{msg.flavor}</div>}
                            <div className={s.content} dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                            {msg.rollTotal !== undefined && (
                                <div className="mt-2 space-y-1">
                                    <div className="bg-slate-200/50 border border-slate-300 rounded p-1 text-center text-sm font-mono text-slate-600">
                                        {msg.rollFormula}
                                    </div>
                                    <div className={`
                                        bg-slate-200/50 border border-slate-300 rounded p-2 text-center font-bold text-xl
                                        ${msg.isCritical ? 'text-green-700' : msg.isFumble ? 'text-red-700' : 'text-slate-800'}
                                    `}>
                                        {msg.isCritical ? `Critical Success! (${msg.rollTotal})` :
                                            msg.isFumble ? `Critical Failure! (${msg.rollTotal})` :
                                                msg.rollTotal}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {messages.length === 0 && <div className="text-center text-slate-500 italic mt-10">No messages yet...</div>}
                </div>
            </div>

            {/* Dice Tray / Chat Input (Bottom) */}
            {!hideDiceTray && (
                <div className="flex-none">
                    <DiceTray onSend={onSend} variant={variant} />
                </div>
            )}
        </div>
    );
}
