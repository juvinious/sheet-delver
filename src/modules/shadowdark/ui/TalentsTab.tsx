'use client';

import { useState } from 'react';
import {
    resolveImage,
    formatDescription,
    getSafeDescription
} from './sheet-utils';

interface TalentsTabProps {
    actor: any;
    onRoll: (type: string, key: string, options?: any) => void;
    foundryUrl?: string; // Added prop
}

export default function TalentsTab({ actor, onRoll, foundryUrl }: TalentsTabProps) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleItem = (id: string) => {
        const newSet = new Set(expandedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedItems(newSet);
    };

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
            }
        }
    };

    // Filter Logic
    const allTalents = (actor.items?.filter((i: any) =>
        ['Talent', 'Feature', 'Patron', 'Boon', 'Class Ability'].includes(i.type)
    ) || []).sort((a: any, b: any) => a.name.localeCompare(b.name));

    // Group: Ancestry & Class (talentClass === 'ancestry' || 'class') - Treat 'class' as catch-all if undefined for now
    // Also include Patron and Boons here as requested
    const ancestryClassTalents = allTalents.filter((i: any) => {
        if (i.type === 'Patron') return true;

        const tc = i.system?.talentClass?.toLowerCase();

        // Boons must be explicitly linked to Ancestry or Class to appear here
        // (Generic/Custom Boons appear in Details Tab)
        if (i.type === 'Boon') {
            return tc === 'ancestry' || tc === 'class';
        }

        return tc === 'ancestry' || tc === 'class' || !tc || tc === '';
    });

    // Group: Level (talentClass === 'level')
    const levelTalents = allTalents.filter((i: any) => {
        return i.system?.talentClass?.toLowerCase() === 'level';
    });

    const renderTalentGroup = (title: string, items: any[], icon?: string) => (
        <div className="space-y-4">
            <div className="bg-black text-white p-2 font-serif font-bold text-xl uppercase tracking-wider flex justify-between items-center shadow-md">
                <span>{title}</span>
                {icon && <i className={`fas ${icon} text-white/50`}></i>}
            </div>

            <div className="space-y-2">
                {items.map((item: any) => {
                    const isExpanded = expandedItems.has(item.id);
                    const cardStyle = "bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative";
                    return (
                        <div key={item.id} className={cardStyle}>
                            {/* Header */}
                            <div
                                className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 p-1 transition-colors"
                                onClick={() => toggleItem(item.id)}
                            >
                                {/* Image / Fallback */}
                                <div className="relative min-w-[40px] w-10 h-10 border border-black bg-black flex items-center justify-center overflow-hidden">
                                    {item.img ? (
                                        <img src={resolveImage(item.img, foundryUrl)} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white font-serif font-bold text-lg">{item.name.charAt(0)}</span>
                                    )}
                                </div>

                                {/* Name & Info */}
                                <div className="flex-1 flex flex-col justify-center overflow-hidden">
                                    <div className="font-serif font-bold text-lg uppercase leading-none truncate text-black">
                                        {item.name}
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                                        {item.system?.talentClass ? item.system.talentClass : (
                                            item.type === 'Patron' ? 'Patron' :
                                                item.type === 'Boon' ? 'Boon' :
                                                    'Class'
                                        )}
                                    </div>
                                </div>

                                {/* Toggle Icon */}
                                <div className="">
                                    <button className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-black transition-colors touch-manipulation">
                                        {isExpanded ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="p-3 pt-0 mt-2 border-t border-dashed border-neutral-300">
                                    <div className="mt-2 text-sm font-serif leading-relaxed text-neutral-800">
                                        <div
                                            className="prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{ __html: formatDescription(getSafeDescription(item.system)) || '<span class="italic text-neutral-400">No description available.</span>' }}
                                            onClick={handleDescriptionClick}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                {items.length === 0 && (
                    <div className="text-center text-neutral-400 italic py-8 border-2 border-dashed border-neutral-200 rounded-lg">No talents found in this category.</div>
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 pb-20">
            {renderTalentGroup("Ancestry & Class", ancestryClassTalents)}
            {renderTalentGroup("Level", levelTalents)}
        </div>
    );
}
