import { SystemAdapter } from '@/modules/core/interfaces';
import DiceTray from './DiceTray';

interface ChatTabProps {
    messages: any[];
    onSend: (msg: string) => void;
    onRoll?: (type: string, key: string) => void;
    foundryUrl?: string;
    hideDiceTray?: boolean;
    hideHeader?: boolean;
    adapter?: SystemAdapter;
}

const defaultStyles = {
    container: "bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl h-full flex flex-col",
    header: "text-white/40 text-[10px] font-bold uppercase mb-4 border-b border-white/10 pb-2 flex items-center gap-2 tracking-widest px-4 pt-4",
    msgContainer: (isRoll: boolean) => `mx-4 p-3 rounded-xl border text-sm transition-colors ${isRoll ? 'bg-white/5 border-white/10' : 'bg-transparent border-white/5 whitespace-pre-wrap'}`,
    user: "font-bold text-amber-500 text-[10px] uppercase tracking-widest",
    time: "text-[10px] text-white/20 font-sans",
    flavor: "text-xs italic text-white/40 mb-1 font-sans",
    content: "text-white/80 leading-relaxed messages-content [&_p]:mb-1 [&_img]:max-w-[48px] [&_img]:max-h-[48px] [&_img]:inline-block [&_img]:rounded-lg [&_img]:border [&_img]:border-white/10",
    rollResult: "mt-2 bg-black/40 p-2 rounded-lg border border-white/5 text-center font-sans",
    rollFormula: "text-[10px] text-white/30 uppercase tracking-widest font-bold",
    rollTotal: "text-xl font-bold text-white",
    button: "inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 rounded-lg px-2 py-0.5 text-[10px] font-bold text-white/80 transition-all cursor-pointer my-1 shadow-sm active:scale-95",
    buttonText: "text-white/40 uppercase tracking-widest",
    buttonValue: "text-amber-500 font-bold"
};

export default function ChatTab({ messages, onSend, foundryUrl, onRoll, hideDiceTray = false, hideHeader = false, adapter }: ChatTabProps) {
    const s = adapter?.componentStyles?.chat || defaultStyles;

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
                const path = p1.replace(/['"]/g, '');
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
                    <span class="${s.buttonText || ''}">${checkMatch[2]}</span>
                    <span class="${s.buttonValue || ''}">DC ${checkMatch[1]}</span>
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
                    <span class="${s.buttonText || ''}">roll</span>
                    <span class="${s.buttonValue || ''}">${formula}</span>
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
                {!hideHeader && <h3 className={s.header}>Chat Log</h3>}
                <div
                    className="flex-1 overflow-y-auto space-y-4 pr-2"
                    onClick={handleChatClick}
                >
                    {messages.map((msg, idx) => (
                        <div key={`${msg.id || msg._id || 'msg'}-${idx}`} className={s.msgContainer ? s.msgContainer(msg.isRoll) : defaultStyles.msgContainer(msg.isRoll)}>
                            <div className="flex justify-between items-center mb-1">
                                <span className={s.user}>{msg.user}</span>
                                <span className={s.time}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                            </div>
                            {msg.flavor && <div className={s.flavor}>{msg.flavor}</div>}
                            <div className={s.content} dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                            {msg.rollTotal !== undefined && (
                                <div className="mt-2 space-y-1">
                                    <div className={s.rollResult}>
                                        <div className={s.rollFormula}>
                                            {msg.rollFormula}
                                        </div>
                                        <div className={`
                                            ${s.rollTotal}
                                            ${msg.isCritical ? 'text-green-500' : msg.isFumble ? 'text-red-500' : ''}
                                        `}>
                                            {msg.isCritical ? `Critical Success! (${msg.rollTotal})` :
                                                msg.isFumble ? `Critical Failure! (${msg.rollTotal})` :
                                                    msg.rollTotal}
                                        </div>
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
                    <DiceTray onSend={onSend} adapter={adapter} />
                </div>
            )}
        </div>
    );
}
