'use client';

interface AbilitiesTabProps {
    actor: any;
    onUpdate: (path: string, value: any) => void;
    triggerRollDialog: (type: string, key: string, name?: string) => void;
}

export default function AbilitiesTab({ actor, onUpdate, triggerRollDialog }: AbilitiesTabProps) {

    // Common container style for standard sheet feel
    const cardStyle = "bg-white border-2 border-black p-4 text-black shadow-sm relative";

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">

            {/* LEFT COLUMN: Vitals, Stats */}
            <div className="md:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-20">

                {/* HP Box */}
                {actor.hp && (
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 flex justify-between items-center px-2 border-b border-white">
                            <span className="font-serif font-bold text-lg">HP</span>
                            <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                        </div>
                        <div className="flex justify-center items-baseline gap-2 font-serif text-3xl font-bold pt-2">
                            <input
                                key={actor.hp.value}
                                type="number"
                                defaultValue={actor.hp.value}
                                onBlur={(e) => {
                                    let val = parseInt(e.target.value);
                                    if (val > actor.hp.max) val = actor.hp.max;
                                    if (val !== parseInt(e.target.value)) e.target.value = val.toString();
                                    if (val !== actor.hp.value) onUpdate('system.attributes.hp.value', val);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                className="w-16 text-center bg-neutral-100 rounded border-b-2 border-neutral-300 focus:border-black outline-none"
                            />
                            <span className="text-neutral-400 text-xl font-sans font-light">/</span>
                            <span>{actor.hp.max}</span>
                        </div>
                    </div>
                )}

                {/* AC & Luck Row */}
                <div className="grid grid-cols-2 gap-4">
                    {/* AC */}
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                            <span className="font-serif font-bold text-lg">AC</span>
                            <img src="/icons/shield.svg" className="w-4 h-4 invert opacity-50" alt="" />
                        </div>
                        <div className="text-center font-serif text-3xl font-bold py-2">
                            {actor.ac || 10}
                        </div>
                    </div>
                    {/* Luck */}
                    <div className={cardStyle}>
                        <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                            <span className="font-serif font-bold text-lg">LUCK</span>
                        </div>
                        <div className="flex justify-center py-2 h-full items-center">
                            <button
                                onClick={() => onUpdate('system.luck.available', !actor.luck?.available)}
                                className={`w-8 h-8 rounded border-2 border-black shadow-sm flex items-center justify-center transition-all bg-white hover:bg-neutral-100`}
                            >
                                {actor.luck?.available && (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-5 h-5 text-black">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 flex justify-between border-b border-white">
                        <span className="font-serif font-bold text-lg">STATS</span>
                        <button className="text-neutral-400 hover:text-white"><i className="fas fa-pen text-xs"></i></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        {Object.entries(actor.stats || {}).map(([key, stat]: [string, any]) => (
                            <div key={key}
                                className="flex flex-col items-center bg-neutral-100 border-2 border-neutral-300 rounded cursor-pointer transition-all hover:border-black hover:bg-white hover:scale-105 active:scale-95 group overflow-hidden"
                                onClick={() => triggerRollDialog('ability', key)}>
                                <div className="w-full bg-neutral-200 text-center py-1 border-b border-neutral-300 group-hover:bg-neutral-800 transition-colors">
                                    <span className="font-bold text-xs uppercase tracking-widest text-neutral-600 group-hover:text-white transition-colors">{key}</span>
                                </div>
                                <div className="flex flex-col items-center py-2">
                                    <span className="font-serif text-2xl font-bold leading-none mb-1 text-black">{stat.base}</span>
                                    <span className="text-neutral-500 text-xs font-serif font-bold">
                                        ({stat.mod >= 0 ? '+' : ''}{stat.mod})
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* RIGHT COLUMN: Combat & Attacks */}
            <div className="md:col-span-2 flex flex-col gap-4 overflow-y-auto pb-20">

                {/* Melee Attacks */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                        <span className="font-serif font-bold text-lg uppercase">Melee Attacks</span>
                    </div>
                    <div className="space-y-2">
                        {actor.items?.filter((i: any) => i.type === 'Weapon' && i.system?.type === 'melee').map((item: any) => {
                            const isFinesse = item.system?.properties?.some((p: any) => p.includes('finesse') || p.includes('Finesse'));
                            const strMod = actor.stats?.STR?.mod || 0;
                            const dexMod = actor.stats?.DEX?.mod || 0;
                            const bonus = (isFinesse ? Math.max(strMod, dexMod) : strMod) + (item.system?.bonuses?.attackBonus || 0);
                            const signedBonus = bonus >= 0 ? `+${bonus}` : bonus;

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => triggerRollDialog('item', item.id)}
                                    className="bg-neutral-50 p-2 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors cursor-pointer group"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold font-serif text-lg leading-none">{item.name}</span>
                                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
                                                {item.system?.damage?.twoHanded ? '(2H)' : '(1H)'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-neutral-700 font-sans mt-1">
                                            <span className="font-bold">{signedBonus}</span> to hit, <span className="font-bold">{item.system?.damage?.numDice || 1}{item.system?.damage?.oneHanded || 'd4'}</span> dmg
                                            {item.system?.properties?.length > 0 && <span className="text-neutral-400 text-xs ml-2 italic">({item.system.properties.length} props)</span>}
                                        </div>
                                    </div>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition-all"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                                            <path d="M12 2L2 22h20L12 2zm0 3.5 6 12H6l6-12z" />
                                            <text x="12" y="19" fontSize="8" fontWeight="bold" textAnchor="middle" fill="black">20</text>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                        {!actor.items?.some((i: any) => i.type === 'Weapon' && i.system?.type === 'melee') && (
                            <div className="text-neutral-400 text-sm italic text-center py-2">No melee weapons equipped.</div>
                        )}
                    </div>
                </div>

                {/* Ranged Attacks */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                        <span className="font-serif font-bold text-lg uppercase">Ranged Attacks</span>
                    </div>
                    <div className="space-y-2">
                        {actor.items?.filter((i: any) => i.type === 'Weapon' && (i.system?.type === 'ranged' || i.system?.range === 'near' || i.system?.range === 'far')).map((item: any) => {
                            const dexMod = actor.stats?.DEX?.mod || 0;
                            const bonus = dexMod + (item.system?.bonuses?.attackBonus || 0);
                            const signedBonus = bonus >= 0 ? `+${bonus}` : bonus;

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => triggerRollDialog('item', item.id)}
                                    className="bg-neutral-50 p-2 border border-neutral-200 flex justify-between items-center hover:border-black transition-colors cursor-pointer group"
                                >
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold font-serif text-lg leading-none">{item.name}</span>
                                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
                                                ({item.system?.range})
                                            </span>
                                        </div>
                                        <div className="text-sm text-neutral-700 font-sans mt-1">
                                            <span className="font-bold">{signedBonus}</span> to hit, <span className="font-bold">{item.system?.damage?.numDice || 1}{item.system?.damage?.oneHanded || 'd4'}</span> dmg
                                        </div>
                                    </div>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-black text-white flex items-center justify-center hover:scale-110 transition-all"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                                            <path d="M12 2L2 22h20L12 2zm0 3.5 6 12H6l6-12z" />
                                            <text x="12" y="19" fontSize="8" fontWeight="bold" textAnchor="middle" fill="black">20</text>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                        {!actor.items?.some((i: any) => i.type === 'Weapon' && (i.system?.type === 'ranged' || i.system?.range === 'near' || i.system?.range === 'far')) && (
                            <div className="text-neutral-400 text-sm italic text-center py-2">No ranged weapons equipped.</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
