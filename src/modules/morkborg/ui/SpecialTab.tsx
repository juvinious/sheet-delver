
interface SpecialTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
}

const ItemBox = ({ item, buttonName, typeName, onRoll, index }: { item: any, buttonName: string, typeName?: string, onRoll: (type: string, key: string, options?: any) => void, index: number }) => {
    return (
        <div key={item._id || item.id} className={`bg-black border border-purple-900/50 p-4 relative overflow-hidden group hover:bg-gray-900/100 transition-colors ${index % 2 === 0 ? 'rotate-1' : '-rotate-1'}`}>
            {typeName && typeName.length > 0 && (
                <div className="absolute top-0 right-0 p-1 bg-purple-900 text-[10px] items-center justify-center flex text-purple-200 font-bold uppercase tracking-wider">
                    {typeName}
                </div>
            )}

            <div className="flex gap-4 items-start relative z-10">
                <img src={item.img} alt={item.name} className="w-12 h-12 shadow-lg border border-purple-500/30" />
                <div className="flex-1">
                    <h4 className="font-bold text-lg text-purple-100 font-serif">{item.name}</h4>
                    <div className="text-purple-300/60 text-xs mt-1 italic">
                        <div dangerouslySetInnerHTML={{ __html: item.description }} />
                    </div>
                </div>
            </div>

            <button
                onClick={() => onRoll('item', item.uuid || item.id)}
                className="mt-4 w-full bg-pink-900 hover:bg-purple-600 text-purple-100 py-2 font-morkborg text-lg border border-purple-500/30 transition-all uppercase tracking-widest group-hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer"
            >
                {buttonName}
            </button>
        </div>
    )
}

export default function SpecialTab({ actor, onRoll }: SpecialTabProps) {
    return (
        <div className="p-1 flex flex-col gap-6">

            {/* Feats */}
            <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900 to-transparent"></div>
                <h3 className="font-morkborg text-3xl mb-4 text-purple-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                    Feats
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {actor.items.feats.map((s: any, index: number) => (
                        <ItemBox key={s._id || s.id} item={s} buttonName={s.rollLabel || 'Use'} onRoll={onRoll} index={index} />))}
                    {!actor.items.feats.length && (
                        <div className="col-span-full text-center py-10 border border-dashed border-purple-900/30 text-purple-900/50 font-morkborg text-xl">
                            No feats known.
                        </div>
                    )}
                </div>
            </div>

            {/* Powers (Scrolls & Tablets) */}
            <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900 to-transparent"></div>
                <h3 className="font-morkborg text-3xl mb-4 text-purple-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                    Powers
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {actor.items.scrolls.map((s: any, index: number) => (
                        <ItemBox key={s._id || s.id} item={s} buttonName="Wield" typeName={s.scrollType || 'Scroll'} onRoll={onRoll} index={index} />))}
                    {!actor.items.scrolls.length && (
                        <div className="col-span-full text-center py-10 border border-dashed border-purple-900/30 text-purple-900/50 font-morkborg text-xl">
                            No obscure powers known.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
