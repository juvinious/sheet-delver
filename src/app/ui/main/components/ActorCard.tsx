import React from 'react';
import { Trash2 } from 'lucide-react';
import { Theme } from '../hooks/useTheme';
import { useFoundry } from '@/app/ui/context/FoundryContext';
import { ActorCardBlock } from '@/shared/interfaces';
import { getMatchingAdapter } from '@/modules/core/registry';

interface ActorCardProps {
    actor: any;
    index: number;
    theme: Theme;
    clickable?: boolean;
    onDelete: (id: string, name: string) => void;
}

export const ActorCard = ({
    actor,
    index,
    theme,
    clickable = true,
    onDelete
}: ActorCardProps) => {

    const { activeAdapter: globalActiveAdapter } = useFoundry();

    const handleClick = () => {
        if (!clickable) return;
        window.location.href = `/actors/${actor.id}`;
    };

    const activeAdapter = globalActiveAdapter || getMatchingAdapter(actor);
    const customData = activeAdapter?.getActorCardData?.(actor) || {};

    const displayName = customData.name || actor.name;
    const displayImg = customData.img || actor.img || '/icons/svg/mystery-man.svg';
    const displaySubtext = customData.subtext || actor.type;

    return (
        <div
            key={actor.id}
            onClick={handleClick}
            className={`
          ${theme.panelBg}/40 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/5 
          ${clickable ? 'hover:border-amber-500/50 hover:-translate-y-1 hover:shadow-2xl cursor-pointer' : 'cursor-default opacity-80'} 
          transition-all duration-300 block group animate-in fade-in slide-in-from-bottom-4
        `}
            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
        >
            <div className="flex items-start gap-4">
                <div className="relative">
                    <img
                        src={displayImg}
                        alt={displayName}
                        className="w-16 h-16 rounded-lg bg-black/40 object-cover border border-white/10 group-hover:border-amber-500/30 transition-colors"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = '/icons/svg/mystery-man.svg';
                        }}
                    />
                    {clickable && (
                        <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/5 transition-colors rounded-lg"></div>
                    )}
                </div>
                <div className="flex-1 min-w-0 relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(actor.id, actor.name);
                        }}
                        className="absolute -top-1 -right-1 p-2 rounded-lg bg-black/20 hover:bg-red-500/20 text-white/20 hover:text-red-500 backdrop-blur-md border border-white/5 hover:border-red-500/50 transition-all duration-300 group/delete z-10"
                        title="Delete Character"
                    >
                        <Trash2 className="w-4 h-4 transition-transform group-hover/delete:scale-110" />
                    </button>
                    <h3 className={`font-bold text-lg truncate pr-8 ${theme.accent} ${clickable ? 'group-hover:brightness-125' : ''}`}>
                        {displayName}
                    </h3>

                    <p className="opacity-60 text-sm mb-2 capitalize truncate">{displaySubtext}</p>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {customData.blocks ? (
                            customData.blocks.map((block: ActorCardBlock, idx: number) => (
                                <div key={idx} className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                    <span className="opacity-50 text-[10px] uppercase tracking-tighter block">{block.title}</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`font-mono font-bold ${block.valueClass || 'text-white'}`}>
                                            {block.value}
                                        </span>
                                        {block.subValue && (
                                            <span className="opacity-30 text-xs">{block.subValue}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            // Fallback rendering
                            <>
                                {(actor.hp || actor.derived?.hp) && (
                                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                        <span className="opacity-50 text-[10px] uppercase tracking-tighter block">HP</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="font-mono font-bold text-green-400">
                                                {actor.hp?.value ?? actor.derived?.hp?.value ?? '?'}
                                            </span>
                                            <span className="opacity-30 text-xs">/ {actor.hp?.max ?? actor.derived?.hp?.max ?? '?'}</span>
                                        </div>
                                    </div>
                                )}
                                {(actor.ac !== undefined || actor.derived?.ac !== undefined) && (
                                    <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                        <span className="opacity-50 text-[10px] uppercase tracking-tighter block">AC</span>
                                        <span className="font-mono font-bold text-blue-400">
                                            {actor.ac ?? actor.derived?.ac ?? '?'}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {customData.footer && (
                        <div className="mt-2 text-xs opacity-70 border-t border-white/10 pt-2">
                            {customData.footer}
                        </div>
                    )}
                </div>
            </div >
        </div >
    );
};
