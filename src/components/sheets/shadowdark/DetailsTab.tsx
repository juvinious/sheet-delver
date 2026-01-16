'use client';

import { resolveImage } from './sheet-utils';

interface DetailsTabProps {
    actor: any;
    systemData: any;
    onUpdate: (path: string, value: any) => void;
    foundryUrl?: string;
}

export default function DetailsTab({ actor, systemData, onUpdate, foundryUrl }: DetailsTabProps) {

    // Common container style for standard sheet feel
    const cardStyle = "bg-white border-2 border-black p-4 text-black shadow-sm relative";
    const cardStyleWithoutPadding = "bg-white border-2 border-black text-black shadow-sm relative";

    return (
        <div className="flex flex-col gap-6 h-full overflow-hidden">
            <div className="flex flex-col gap-6 overflow-y-auto pb-20">

                {/* Top Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Level */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Level</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 text-center font-serif text-xl font-bold bg-white flex items-center justify-center min-h-[44px]">
                            {actor.computed?.levelUp ? (
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="w-8 h-8 text-emerald-600 animate-bounce"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                >
                                    <title>Level Up Available!</title>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                            ) : (
                                <span>{actor.system?.level?.value || 1}</span>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Title</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {(() => {
                                const clsVal = actor.items?.find((i: any) => i.type === 'Class')?.name;
                                const clsObj = systemData?.classes?.find((c: any) => c.uuid === clsVal || c.name === clsVal);
                                const clsName = clsObj ? clsObj.name : clsVal;
                                const lvl = actor.system?.level?.value || 1;
                                const sysTitle = systemData?.titles?.[clsName]?.find((t: any) => lvl >= t.from && lvl <= t.to);
                                const alignment = (actor.system?.alignment || 'neutral').toLowerCase();
                                return actor.system?.title || sysTitle?.[alignment] || '-';
                            })()}
                        </div>
                    </div>

                    {/* Class */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Class</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white flex items-center gap-2">
                            <i className="fas fa-book text-neutral-400"></i>
                            {actor.items?.find((i: any) => i.type === 'Class')?.name || 'Unknown'}
                        </div>
                    </div>

                    {/* XP */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">XP</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 flex items-center justify-center gap-2 font-serif text-lg bg-white">
                            <input
                                type="number"
                                defaultValue={actor.system?.level?.xp || 0}
                                min={0}
                                max={10}
                                onBlur={(e) => {
                                    let val = parseInt(e.target.value);
                                    if (isNaN(val)) val = 0;
                                    // Constraint validation
                                    if (val < 0) val = 0;
                                    if (val > 10) val = 10;

                                    // Update input if corrected
                                    if (val.toString() !== e.target.value) {
                                        e.target.value = val.toString();
                                    }

                                    if (val !== actor.system?.level?.xp) onUpdate('system.level.xp', val);
                                }}
                                className="w-12 bg-neutral-200/50 border-b border-black text-center outline-none rounded px-1"
                            />
                            <span className="text-neutral-400">/</span>
                            <span>{actor.system?.level?.next || 10}</span>
                        </div>
                    </div>

                    {/* Ancestry */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {actor.items?.find((i: any) => i.type === 'Ancestry')?.name || 'Unknown'}
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Background</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {actor.items?.find((i: any) => i.type === 'Background')?.name || 'Unknown'}
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1.5`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Alignment</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <select
                                className="w-full bg-transparent outline-none cursor-pointer"
                                defaultValue={actor.system?.alignment || 'neutral'}
                                onChange={(e) => onUpdate('system.alignment', e.target.value)}
                            >
                                <option value="lawful">Lawful</option>
                                <option value="neutral">Neutral</option>
                                <option value="chaotic">Chaotic</option>
                            </select>
                        </div>
                    </div>

                    {/* Deity */}
                    <div className={`${cardStyleWithoutPadding} md:col-span-2 lg:col-span-1.5`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Deity</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {actor.items?.find((i: any) => i.type === 'Deity')?.name || actor.system?.deity || '-'}
                        </div>
                    </div>
                </div>


                {/* Languages */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-1 -mx-4 -mt-4 mb-2 px-2 border-b border-white">
                        <span className="font-serif font-bold text-lg uppercase">Languages</span>
                    </div>
                    <div className="p-1 flex flex-wrap gap-2">
                        {(() => {
                            const actorLangsRaw = actor.system?.languages || [];
                            const resolvedLangs = actorLangsRaw.map((l: any) => {
                                const isObj = typeof l === 'object';
                                const val = isObj ? l.name : l;
                                const match = systemData?.languages?.find((sl: any) => sl.uuid === val || sl.name === val);
                                return {
                                    raw: val,
                                    name: match ? match.name : val,
                                    desc: match ? match.description : (isObj ? l.description : 'Description unavailable.'),
                                    rarity: match ? match.rarity : 'common',
                                    uuid: match ? match.uuid : null
                                };
                            });

                            // Official system logic: Common = Purple, Others = Black
                            return resolvedLangs.sort((a: any, b: any) => a.name.localeCompare(b.name))
                                .map((lang: any, i: number) => {
                                    const isCommon = lang.rarity?.toLowerCase() === 'common';
                                    const bgColor = isCommon ? 'bg-[#78557e]' : 'bg-black';

                                    let tooltip = lang.desc && lang.desc !== '<p></p>' ? lang.desc.replace(/<[^>]*>?/gm, '') : 'No description.';
                                    if (lang.rarity) tooltip += ` (${lang.rarity})`;

                                    return (
                                        <span
                                            key={i}
                                            title={tooltip}
                                            className={`cursor-help font-serif text-sm font-medium px-2 py-0.5 text-white shadow-sm ${bgColor}`}
                                        >
                                            {lang.name}
                                        </span>
                                    );
                                });
                        })()}
                        {(!actor.system?.languages || actor.system.languages.length === 0) && <span className="text-neutral-500 text-sm italic">None known</span>}
                    </div>
                </div>

                {/* Boons */}
                <div className={cardStyle}>
                    <div className="bg-black text-white p-2 mb-2 -mx-4 -mt-4 border-b-2 border-white flex justify-between items-center">
                        <span className="font-bold font-serif uppercase tracking-widest text-lg">Boons</span>
                    </div>
                    <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-widest text-neutral-500 border-b-2 border-black px-2 py-1 mb-2">
                        <div className="col-span-6">Boon Name</div>
                        <div className="col-span-3">Type</div>
                        <div className="col-span-3 text-center">Level</div>
                    </div>
                    <div className="divide-y divide-neutral-200">
                        {(actor.items?.filter((i: any) => i.type === 'Boon') || [])
                            .sort((a: any, b: any) => a.name.localeCompare(b.name))
                            .map((item: any) => (
                                <div key={item.id} className="grid grid-cols-12 py-2 px-2 text-sm font-serif items-center">
                                    <div className="col-span-6 font-bold flex items-center">
                                        <img
                                            src={resolveImage(item.img, foundryUrl)}
                                            alt={item.name}
                                            className="w-6 h-6 object-cover border border-black mr-2 bg-neutral-200"
                                        />
                                        {item.name}
                                    </div>
                                    <div className="col-span-3 text-neutral-600 capitalize">{item.system?.boonType || item.system?.type || '-'}</div>
                                    <div className="col-span-3 text-center">{item.system?.level?.value || item.system?.level || '-'}</div>
                                </div>
                            ))}
                        {(!actor.items?.some((i: any) => i.type === 'Boon')) && (
                            <div className="text-center text-neutral-400 italic py-4 text-xs">No boons recorded.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
