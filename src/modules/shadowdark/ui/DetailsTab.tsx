'use client';


import { useEffect } from 'react';
import { resolveImage, resolveEntityName } from './sheet-utils';

interface DetailsTabProps {
    actor: any;
    systemData: any;
    onUpdate: (path: string, value: any) => void;
    foundryUrl?: string;
}

export default function DetailsTab({ actor, systemData, onUpdate, foundryUrl }: DetailsTabProps) {

    const cardStyle = "bg-white border-2 border-black p-4 text-black shadow-sm relative";
    const cardStyleWithoutPadding = "bg-white border-2 border-black text-black shadow-sm relative";

    // Auto-resolve UUIDs to Names (Deity, Patron)
    useEffect(() => {
        const resolveField = async (path: string, value: string) => {
            if (typeof value === 'string' && (value.startsWith('Compendium.') || value.includes('Item.')) && !value.includes(' ')) {
                try {
                    const res = await fetch(`/api/foundry/document?uuid=${value}`);
                    if (res.ok) {
                        const doc = await res.json();
                        if (doc && doc.name) {
                            onUpdate(path, doc.name);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to resolve ${path}`, e);
                }
            }
        };

        if (actor.system?.deity) resolveField('system.deity', actor.system.deity);

        // Only resolve Patron if we don't have an embedded item (which takes precedence in display)
        const hasPatronItem = (actor.items || []).some((i: any) => i.type?.toLowerCase() === 'patron');
        if (!hasPatronItem && actor.system?.patron) {
            resolveField('system.patron', actor.system.patron);
        }

    }, [actor.system?.deity, actor.system?.patron, actor.items]);

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
                                <span>{actor.system?.level?.value ?? 1}</span>
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
                                const clsName = resolveEntityName(actor.system?.class, actor, systemData, 'classes');
                                const lvl = actor.system?.level?.value ?? 1;
                                // Debug Title Resolution
                                // console.log('Title Debug:', { clsName, lvl, titles: systemData?.titles });
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
                            <input
                                type="text"
                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-lg font-serif"
                                value={(() => {
                                    return resolveEntityName(actor.system?.class, actor, systemData, 'classes');
                                })()}
                                onChange={(e) => onUpdate('system.class', e.target.value)}
                                placeholder="Class"
                            />
                        </div>
                    </div>

                    {/* XP */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">XP</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className={`p-2 flex items-center justify-center gap-2 font-serif text-lg bg-white min-h-[44px] ${(!actor.system?.level?.value || actor.system.level.value === 0) ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                            <input
                                type="number"
                                defaultValue={actor.system?.level?.xp || 0}
                                min={0}
                                max={10}
                                disabled={!actor.system?.level?.value || actor.system.level.value === 0}
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
                                className={`w-12 bg-neutral-200/50 border-b border-black text-center outline-none rounded px-1 disabled:bg-transparent disabled:border-transparent`}
                            />
                            <span className="text-neutral-400">/</span>
                            <span>{actor.system?.level?.next ?? 10}</span>
                        </div>
                    </div>

                    {/* Ancestry */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Ancestry</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-lg font-serif"
                                value={(() => {
                                    return resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries');
                                })()}
                                onChange={(e) => onUpdate('system.ancestry', e.target.value)}
                                placeholder="Ancestry"
                            />
                        </div>
                    </div>

                    {/* Background */}
                    <div className={cardStyleWithoutPadding}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Background</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-lg font-serif"
                                value={(() => {
                                    return resolveEntityName(actor.system?.background, actor, systemData, 'backgrounds');
                                })()}
                                onChange={(e) => onUpdate('system.background', e.target.value)}
                                placeholder="Background"
                            />
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className={`${cardStyleWithoutPadding} ${(actor.details?.class || '').toLowerCase().includes('warlock')
                        ? 'md:col-span-2 lg:col-span-1'
                        : 'md:col-span-1 lg:col-span-1.5'
                        }`}>
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
                    <div className={`${cardStyleWithoutPadding} ${(actor.details?.class || '').toLowerCase().includes('warlock')
                        ? 'md:col-span-1 lg:col-span-1'
                        : 'md:col-span-2 lg:col-span-1.5'
                        }`}>
                        <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                            <span className="font-serif font-bold text-lg uppercase">Deity</span>
                            <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                        </div>
                        <div className="p-2 font-serif text-lg bg-white">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none focus:ring-0 p-0 text-lg font-serif"
                                value={actor.system?.deity || ''}
                                onChange={(e) => onUpdate('system.deity', e.target.value)}
                                placeholder="Deity"
                            />
                        </div>
                    </div>

                    {/* Patron (Only for Warlock) */}
                    {(actor.details?.class || '').toLowerCase().includes('warlock') && (
                        <div className={`${cardStyleWithoutPadding} md:col-span-1 lg:col-span-1`}>
                            <div className="bg-black text-white p-1 px-2 border-b border-white flex justify-between items-center">
                                <span className="font-serif font-bold text-lg uppercase">Patron</span>
                                <img src="/icons/edit.svg" className="w-3 h-3 invert opacity-50" alt="" />
                            </div>
                            <div className="p-2 font-serif text-lg bg-white">
                                {(() => {
                                    // Try to resolve Patron Name
                                    // It might be stored as a UUID in 'system.patron' or we might look for an Item of type 'Patron'
                                    // Shadowdark adapter should have resolved it?
                                    // Let's assume system.patron holds UUID, OR check for item.
                                    // But input implies we can edit it? Or is it fixed?
                                    // Usually Warlock Patrons are items.
                                    // Let's allow editing name for now? Or just display?
                                    // If we want to support changing passing 'system.patron' (UUID) is hard with text input.
                                    // Let's try to display the name of the Patron item if found, else just text input?

                                    const patronItem = (actor.items || []).find((i: any) => i.type?.toLowerCase() === 'patron');
                                    const patronName = patronItem ? patronItem.name : (actor.system?.patron || '');

                                    return (
                                        <input
                                            type="text"
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-lg font-serif"
                                            value={patronName}
                                            readOnly={!!patronItem} // If item exists, read only? Or allow text override?
                                            // The user didn't specify editing, just display.
                                            // But standard fields are editable. 
                                            // Since 'system.patron' is likely a UUID link, text edit might break it. 
                                            // Let's disable edit if it looks like a Patron Item exists.
                                            onChange={(e) => {
                                                // If no item, maybe we store string in system.patron?
                                                if (!patronItem) onUpdate('system.patron', e.target.value);
                                            }}
                                            placeholder="Patron"
                                        />
                                    );
                                })()}
                            </div>
                        </div>
                    )}
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
