'use client';

import { resolveImage } from './sheet-utils';

interface BackgroundTabProps {
    actor: any;
    systemData: any;
    onUpdate: (path: string, value: any) => void;
    foundryUrl?: string;
}

export default function BackgroundTab({ actor, systemData, onUpdate, foundryUrl }: BackgroundTabProps) {

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
                        <div className="p-2 text-center font-serif text-xl font-bold bg-white">
                            {actor.level?.value || 1}
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
                                const clsVal = actor.details?.class;
                                const clsObj = systemData?.classes?.find((c: any) => c.uuid === clsVal || c.name === clsVal);
                                const clsName = clsObj ? clsObj.name : clsVal;
                                const lvl = actor.level?.value || 1;
                                const sysTitle = systemData?.titles?.[clsName]?.find((t: any) => lvl >= t.from && lvl <= t.to);
                                const alignment = (actor.details?.alignment || 'neutral').toLowerCase();
                                return actor.details?.title || sysTitle?.[alignment] || '-';
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
                            {actor.details?.class || 'Unknown'}
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
                                defaultValue={actor.level?.xp || 0}
                                onBlur={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val !== actor.level?.xp) onUpdate('system.level.xp', val);
                                }}
                                className="w-12 bg-neutral-200/50 border-b border-black text-center outline-none rounded px-1"
                            />
                            <span className="text-neutral-400">/</span>
                            <span>{actor.level?.next || 10}</span>
                        </div>
                    </div>

                    {/* Ancestry */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {actor.details?.ancestry || 'Unknown'}
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Background</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            {actor.details?.background || 'Unknown'}
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
                                defaultValue={actor.details?.alignment || 'neutral'}
                                onChange={(e) => onUpdate('system.details.alignment', e.target.value)}
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
                            {actor.details?.deity || '-'}
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
                            const actorLangsRaw = actor.details?.languages || [];
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

                            let classConfig: any = { fixed: [], common: 0, rare: 0, languages: [] };
                            const rawClassLangs = actor.details?.classLanguages;
                            let targetClassData = rawClassLangs;
                            if (!targetClassData && actor.details?.class && systemData?.classes) {
                                const classDoc = systemData.classes.find((c: any) => c.name === actor.details.class);
                                if (classDoc) targetClassData = classDoc.languages;
                            }

                            if (Array.isArray(targetClassData)) {
                                classConfig.fixed = targetClassData;
                            } else if (typeof targetClassData === 'object' && targetClassData !== null) {
                                classConfig.fixed = targetClassData.fixed || [];
                                classConfig.common = targetClassData.common || 0;
                                classConfig.rare = targetClassData.rare || 0;
                            }

                            const actorCounts = resolvedLangs.reduce((acc: any, l: any) => {
                                acc[l.rarity] = (acc[l.rarity] || 0) + 1;
                                return acc;
                            }, {});

                            return resolvedLangs.map((lang: any, i: number) => {
                                let isClass = classConfig.fixed.includes(lang.name) ||
                                    classConfig.fixed.includes(lang.raw) ||
                                    (lang.uuid && classConfig.fixed.includes(lang.uuid));

                                if (!isClass) {
                                    if (lang.rarity === 'common' && classConfig.common > 0) {
                                        if (actorCounts['common'] <= classConfig.common) isClass = true;
                                    } else if (lang.rarity === 'rare' && classConfig.rare > 0) {
                                        if (actorCounts['rare'] <= classConfig.rare) isClass = true;
                                    }
                                }

                                let tooltip = lang.desc && lang.desc !== '<p></p>' ? lang.desc.replace(/<[^>]*>?/gm, '') : 'No description.';
                                if (lang.rarity) tooltip += ` (${lang.rarity})`;

                                return (
                                    <span
                                        key={i}
                                        title={tooltip}
                                        className={`cursor-help font-serif text-sm font-medium px-2 py-0.5 text-white shadow-sm ${isClass ? 'bg-black' : 'bg-[#7c4f8d]'}`}
                                    >
                                        {lang.name}
                                    </span>
                                );
                            });
                        })()}
                        {(!actor.details?.languages || actor.details.languages.length === 0) && <span className="text-neutral-500 text-sm italic">None known</span>}
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
                        {actor.items?.filter((i: any) => i.type === 'Boon').map((item: any) => (
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
