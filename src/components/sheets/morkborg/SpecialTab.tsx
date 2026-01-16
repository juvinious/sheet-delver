
interface SpecialTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
}

export default function SpecialTab({ actor, onRoll }: SpecialTabProps) {
    return (
        <div className="p-1 flex flex-col gap-6">

            {/* Powers (Scrolls) */}
            <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900 to-transparent"></div>
                <h3 className="font-morkborg text-3xl mb-4 text-purple-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                    Powers & Scrolls
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {actor.items.scrolls.map((s: any) => (
                        <div key={s.id} className="bg-purple-900/10 border border-purple-900/50 p-4 relative overflow-hidden group hover:bg-purple-900/20 transition-colors">
                            <div className="absolute top-0 right-0 p-1 bg-purple-900 text-[10px] items-center justify-center flex text-purple-200 font-bold uppercase tracking-wider">
                                {s.isUnclean ? 'Unclean' : s.isSacred ? 'Sacred' : 'Scroll'}
                            </div>

                            <div className="flex gap-4 items-start relative z-10">
                                <img src={s.img} alt={s.name} className="w-12 h-12 shadow-lg border border-purple-500/30" />
                                <div className="flex-1">
                                    <h4 className="font-bold text-lg text-purple-100 font-serif">{s.name}</h4>
                                    <div className="text-purple-300/60 text-xs mt-1 line-clamp-2 italic">
                                        {/* Description would be nice here if mapped */}
                                        The words writhe on the parchment...
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => onRoll('item', s.uuid || s.id)}
                                className="mt-4 w-full bg-purple-900/40 hover:bg-purple-600 text-purple-100 py-2 font-morkborg text-lg border border-purple-500/30 transition-all uppercase tracking-widest group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                            >
                                Wield Power
                            </button>
                        </div>
                    ))}
                    {!actor.items.scrolls.length && (
                        <div className="col-span-full text-center py-10 border border-dashed border-purple-900/30 text-purple-900/50 font-morkborg text-xl">
                            No obscure powers known.
                        </div>
                    )}
                </div>
            </div>

            {/* Feats / Abilities */}
            <div className="mt-6">
                <h3 className="font-morkborg text-3xl mb-4 text-stone-400">
                    Feats & Traits
                </h3>
                <div className="space-y-3">
                    {actor.items.abilities.map((f: any) => (
                        <div key={f.id} className="bg-stone-900/50 p-4 border-l-4 border-stone-600 flex justify-between items-center group">
                            <div>
                                <h4 className="font-bold text-stone-200 text-lg mb-1">{f.name}</h4>
                                <p className="text-stone-500 text-sm max-w-md">Class feature or trait.</p>
                            </div>
                            {/* Uses button if applicable, otherwise just display */}
                            <button
                                onClick={() => onRoll('item', f.uuid || f.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1 text-sm border border-stone-600"
                            >
                                Use
                            </button>
                        </div>
                    ))}
                    {!actor.items.abilities.length && (
                        <div className="text-neutral-600 italic">No special traits. Just flesh.</div>
                    )}
                </div>
            </div>

        </div>
    );
}
