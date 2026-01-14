'use client';

import { resolveImage } from './sheet-utils';

interface EffectsTabProps {
    actor: any;
    foundryUrl?: string;
}

export default function EffectsTab({ actor, foundryUrl }: EffectsTabProps) {
    return (
        <div className="space-y-4">
            {/* Active Effects List */}
            {actor.effects && actor.effects.length > 0 ? (
                actor.effects.map((effect: any) => (
                    <div key={effect.id} className="bg-white border-2 border-black p-4 flex gap-4 items-center shadow-sm">
                        <div className="bg-neutral-200 p-2 min-w-[48px] h-12 flex items-center justify-center font-bold text-2xl font-serif border border-neutral-400">
                            <img src={resolveImage(effect.icon || '/icons/svg/aura.svg', foundryUrl)} className="w-8 h-8 opacity-50" alt="" />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                                <h3 className="font-serif font-bold text-lg uppercase tracking-wide leading-none">{effect.label}</h3>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${effect.disabled ? 'bg-neutral-200 text-neutral-500' : 'bg-green-100 text-green-800 border border-green-200'}`}>
                                    {effect.disabled ? 'Inactive' : 'Active'}
                                </span>
                            </div>
                            <div className="text-xs text-neutral-500 font-sans">
                                {effect.duration?.rounds ? `${effect.duration.rounds} rounds` : (effect.duration?.seconds ? `${effect.duration.seconds}s` : 'Permanent')}
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center py-20 border-2 border-dashed border-neutral-300 text-neutral-400 font-serif italic text-xl">
                    No active effects.
                </div>
            )}
        </div>
    );
}
