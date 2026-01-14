'use client';

import {
    formatDescription
} from './sheet-utils';

interface TalentsTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    onChatSend: (msg: string) => void;
}

export default function TalentsTab({ actor, onRoll, onChatSend }: TalentsTabProps) {

    const handleDescriptionClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const rollBtn = target.closest('button[data-action]');

        if (rollBtn) {
            e.preventDefault();
            e.stopPropagation();
            const action = rollBtn.getAttribute('data-action');
            if (action === 'roll-check') {
                const stat = rollBtn.getAttribute('data-stat');
                if (stat) onRoll('ability', stat);
            } else if (action === 'roll-formula') {
                const formula = rollBtn.getAttribute('data-formula');
                if (formula) onChatSend(`/r ${formula}`);
            }
        }
    };

    return (
        <div className="space-y-4">
            {/* Using a more list-like approach for talents to mimic the sheet */}
            {actor.items?.filter((i: any) => i.type === 'Talent' || i.type === 'Feature').map((item: any) => (
                <div key={item.id} className="bg-white border-black border-2 p-1 flex gap-2 shadow-sm">
                    <div className="bg-black text-white p-2 min-w-[40px] flex items-center justify-center font-bold text-lg font-serif">
                        {item.name.charAt(0)}
                    </div>
                    <div className="p-2 flex-1">
                        <div className="font-bold font-serif text-lg uppercase mb-1">{item.name}</div>
                        <div
                            className="text-sm text-neutral-700 leading-relaxed font-serif"
                            dangerouslySetInnerHTML={{ __html: formatDescription(item.system?.description?.value) || '' }}
                            onClick={handleDescriptionClick}
                        ></div>
                    </div>
                </div>
            ))}
            {(!actor.items?.some((i: any) => i.type === 'Talent' || i.type === 'Feature')) && (
                <div className="col-span-full text-center text-neutral-500 italic p-10 font-serif">No talents recorded.</div>
            )}
        </div>
    );
}
