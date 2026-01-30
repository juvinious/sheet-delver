'use client';

import { useState, useEffect, useRef } from 'react';
import RollDialog from '@/components/RollDialog';
import LoadingModal from '@/components/LoadingModal';
import { useNotifications, NotificationContainer } from '@/components/NotificationSystem';
import { Crimson_Pro, Inter } from 'next/font/google';
import { resolveImage, resolveEntityName, calculateSpellBonus, resolveEntityUuid } from './sheet-utils';
import { Menu, X } from 'lucide-react';

// Sub-components
import InventoryTab from './InventoryTab';
import SpellsTab from './SpellsTab';
import TalentsTab from './TalentsTab';
import AbilitiesTab from './AbilitiesTab';
import DetailsTab from './DetailsTab';
import EffectsTab from './EffectsTab';
import NotesTab from './NotesTab';
import { LevelUpModal } from './components/LevelUpModal';

// Typography
const crimson = Crimson_Pro({ subsets: ['latin'], variable: '--font-crimson' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });


interface ShadowdarkSheetProps {
    actor: any;
    foundryUrl?: string;
    onRoll: (type: string, key: string, options?: any) => void;
    onUpdate: (path: string, value: any) => void;
    onToggleEffect: (effectId: string, enabled: boolean) => void;
    onDeleteEffect: (effectId: string) => void;
    onDeleteItem?: (itemId: string) => void;
    onCreateItem?: (itemData: any) => Promise<void>;
    onUpdateItem?: (itemData: any, deletedEffectIds?: string[]) => Promise<void>;

    onToggleDiceTray?: () => void;
    isDiceTrayOpen?: boolean;
}

export default function ShadowdarkSheet({ actor, foundryUrl, onRoll, onUpdate, onToggleEffect, onDeleteEffect, onDeleteItem, onCreateItem, onUpdateItem, onToggleDiceTray, isDiceTrayOpen }: ShadowdarkSheetProps) {
    const [activeTab, setActiveTab] = useState('details');
    const [systemData, setSystemData] = useState<any>(null);
    const [loadingSystem, setLoadingSystem] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showLevelUpModal, setShowLevelUpModal] = useState(false);
    const [levelUpData, setLevelUpData] = useState<any>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const { notifications, addNotification, removeNotification } = useNotifications();

    const [rollDialog, setRollDialog] = useState<{
        open: boolean;
        title: string;
        type: 'attack' | 'ability' | 'spell';
        defaults: any;
        callback: ((options: any) => void) | null;
    }>({
        open: false,
        title: '',
        type: 'attack',
        defaults: {},
        callback: null
    });

    const triggerRollDialog = (type: string, key: string) => {
        let dialogType: 'attack' | 'ability' | 'spell' = 'attack';
        let title = '';
        const defaults: any = {};

        if (type === 'ability') {
            dialogType = 'ability';
            title = `${key.toUpperCase().replace('ABILITY', '')} Ability Check`; // e.g. "STR Ability Check"
            // Find mod
            const stat = actor.stats?.[key] || {};
            defaults.abilityBonus = stat.mod || 0;
        } else if (type === 'item') {
            // Find item
            const item = actor.items?.find((i: any) => i.id === key);
            if (item) {
                if (item.type === 'Spell') {
                    dialogType = 'spell';
                    title = `Cast Spell: ${item.name}`;
                    const statKey = item.system?.ability || 'int';
                    const stat = actor.stats?.[statKey] || {};
                    defaults.abilityBonus = stat.mod || 0;
                    defaults.talentBonus = calculateSpellBonus(actor);
                    defaults.showItemBonus = false; // Hide Item Bonus for known spells
                } else {
                    dialogType = 'attack';
                    title = `Roll Attack with ${item.name}`;
                    // Attempt to pre-calculate bonuses
                    const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                    const isRanged = item.system?.type === 'ranged'; // Only force DEX if explicitly a ranged weapon

                    const str = actor.stats?.str?.mod || actor.stats?.STR?.mod || 0;
                    const dex = actor.stats?.dex?.mod || actor.stats?.DEX?.mod || 0;

                    let statBonus = str;
                    if (isRanged) statBonus = dex;
                    else if (isFinesse) statBonus = Math.max(str, dex);

                    defaults.abilityBonus = statBonus;
                    defaults.itemBonus = item.system?.bonuses?.attackBonus || 0;
                }
            }
        }

        setRollDialog({
            open: true,
            title,
            type: dialogType,
            defaults,
            callback: (options) => {
                onRoll(type, key, options); // Pass options back up
            }
        });
    };

    useEffect(() => {
        setLoadingSystem(true);
        fetch('/api/system/data')
            .then(res => res.json())
            .then(data => setSystemData(data))
            .catch(err => console.error('Failed to fetch system data:', err))
            .finally(() => setLoadingSystem(false));
    }, []);

    // Dynamic Tabs Logic
    const [tabsOrder, setTabsOrder] = useState([
        { id: 'details', label: 'Details' },
        { id: 'abilities', label: 'Abilities' },
        { id: 'spells', label: 'Spells' },
        { id: 'inventory', label: 'Inventory' },
        { id: 'talents', label: 'Talents' },
        { id: 'notes', label: 'Notes' },
        { id: 'effects', label: 'Effects' },
    ]);

    const [visibleTabs, setVisibleTabs] = useState<typeof tabsOrder>([]);
    const [overflowTabs, setOverflowTabs] = useState<typeof tabsOrder>([]);

    // Determine how many tabs fit based on width
    const getVisibleCount = (width: number) => {
        if (width < 640) return 3;
        if (width < 1024) return 5;
        return tabsOrder.length;
    };

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            let currentTabs = [...tabsOrder];

            // Filter out Spells tab if not applicable
            if (!actor.computed?.showSpellsTab) {
                currentTabs = currentTabs.filter(t => t.id !== 'spells');
            }

            const count = getVisibleCount(width); // This counts based on full list length usually, might need adjusting

            setVisibleTabs(currentTabs.slice(0, count));
            setOverflowTabs(currentTabs.slice(count));
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [tabsOrder, actor.computed?.showSpellsTab]);

    // Auto-close Level Up Modal when level effectively changes
    useEffect(() => {
        if (showLevelUpModal && levelUpData && actor.system?.level?.value === levelUpData.targetLevel) {
            setShowLevelUpModal(false);
            setLevelUpData(null);
            addNotification('Level Up Complete!', 'success');
        }
    }, [actor.system?.level?.value, showLevelUpModal, levelUpData, addNotification]);

    const handleTabSelect = (tabId: string) => {
        setActiveTab(tabId);

        // Check if tab is in overflow
        const isOverflow = overflowTabs.some(t => t.id === tabId);
        if (isOverflow) {
            // Swap with last visible tab
            const width = window.innerWidth;
            const count = getVisibleCount(width);

            // Should be at least 1 visible tab to swap with
            if (count > 0) {
                const newOrder = [...tabsOrder];
                const lastVisibleIndex = count - 1;
                const selectedIndex = newOrder.findIndex(t => t.id === tabId);

                if (selectedIndex > -1) {
                    // Swap
                    const temp = newOrder[lastVisibleIndex];
                    newOrder[lastVisibleIndex] = newOrder[selectedIndex];
                    newOrder[selectedIndex] = temp;

                    setTabsOrder(newOrder);
                    // Resize effect will handle the slicing
                }
            }
        }

        setMenuOpen(false); // Close menu if open
    };

    // Click Outside for Menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };

        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    const primaryTabs = visibleTabs; // Use mapped state
    const secondaryTabs = overflowTabs;

    return (
        <div className={`flex flex-col h-full relative pb-0 ${crimson.variable} ${inter.variable} font-sans bg-neutral-100 text-black`}>
            {/* Loading Overlay */}
            <LoadingModal message="Loading System Data..." visible={loadingSystem} />

            {/* Header / Top Nav */}
            <div className="bg-neutral-900 text-white shadow-md sticky top-0 z-10 flex flex-col md:flex-row items-stretch justify-between mb-6 border-b-4 border-black min-h-[6rem] transition-all">
                <div className="flex items-center gap-4 md:gap-6 p-4 md:p-0 md:pl-0 w-full md:w-auto border-b md:border-b-0 border-white/10 md:border-none">
                    <img
                        src={resolveImage(actor.img, foundryUrl)}
                        alt={actor.name}
                        className="h-16 w-16 md:h-24 md:w-24 object-cover border-r-2 border-white/10 bg-neutral-800 shrink-0"
                    />
                    <div className="py-2 flex-1 flex flex-row items-center justify-between md:block">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-serif font-bold leading-none tracking-tight">{actor.name}</h1>
                            <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                                {resolveEntityName(actor.system?.ancestry, actor, systemData, 'ancestries')} {resolveEntityName(actor.system?.class, actor, systemData, 'classes')}
                            </p>
                        </div>
                        {/* Level displayed inline on mobile for space or block on desktop */}
                        <div className="text-xl font-bold font-serif md:hidden">
                            {actor.system?.level?.value !== undefined ? `Level ${actor.system.level.value}` : ''}
                        </div>
                        <p className="hidden md:block text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                            {actor.system?.level?.value !== undefined ? `Level ${actor.system.level.value}` : ''}
                        </p>
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="flex gap-4 md:gap-6 items-center px-4 md:pr-6 pb-2 md:pb-0 justify-around md:justify-end w-full md:w-auto bg-neutral-900 md:bg-transparent">

                    {actor.computed?.levelUp && (
                        <button
                            onClick={() => {
                                setLevelUpData({
                                    currentLevel: actor.system?.level?.value || 0,
                                    targetLevel: (actor.system?.level?.value || 0) + 1,
                                    classObj: actor.classDetails, // May be missing if not populated by parent
                                    ancestry: actor.system?.ancestry,
                                    patron: actor.patronDetails,
                                    abilities: actor.system?.abilities,
                                    spells: actor.items?.filter((i: any) => i.type === 'Spell') || [],
                                    // If Level 0, force empty classUuid so modal prompts for class selection
                                    classUuid: (actor.system?.level?.value || 0) === 0 ? "" : resolveEntityUuid(actor.system?.class || '', systemData, 'classes'),
                                    // Pass explicit UUIDs for class/patron in case objects are missing
                                    patronUuid: resolveEntityUuid(actor.system?.patron || '', systemData, 'patrons')
                                });
                                setShowLevelUpModal(true);
                            }}
                            className="bg-amber-500 text-black px-2 py-1 text-xs md:text-sm font-bold rounded animate-pulse shadow-lg ring-2 ring-amber-400/50 hover:bg-amber-400 transition-colors cursor-pointer"
                        >
                            LEVEL UP!
                        </button>
                    )}
                    {actor.system?.attributes?.hp && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">HP</span>
                            <div className="flex items-center gap-1 font-serif font-bold text-xl md:text-2xl">
                                <input
                                    key={actor.system.attributes.hp.value} // Force remount to sync when other tabs update it
                                    type="number"
                                    defaultValue={actor.system.attributes.hp.value}
                                    onBlur={(e) => {
                                        let val = parseInt(e.target.value);
                                        const max = actor.computed?.maxHp || 1;
                                        // Enforce Max HP Cap
                                        if (val > max) val = max;
                                        // Reset input display if it was capped
                                        if (val !== parseInt(e.target.value)) e.target.value = val.toString();

                                        if (val !== actor.system.attributes.hp.value) onUpdate('system.attributes.hp.value', val);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    className="w-10 md:w-12 text-center bg-transparent border-b border-neutral-300 hover:border-black focus:border-amber-500 outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="opacity-50">/</span>
                                <span>{actor.computed?.maxHp ?? actor.system.attributes.hp.max}</span>
                            </div>
                        </div>
                    )}
                    {(actor.computed?.ac !== undefined) && (
                        <div className="flex flex-col items-center">
                            <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-widest">AC</span>
                            <span className="font-serif font-bold text-xl md:text-2xl">{actor.computed.ac}</span>
                        </div>
                    )}

                    {/* Dice Tray Button */}
                    <button
                        onClick={() => onToggleDiceTray?.()}
                        className={`dice-tray-toggle flex flex-col items-center group -mb-1 transition-colors ${isDiceTrayOpen ? 'text-amber-500' : 'text-neutral-500'}`}
                        title={isDiceTrayOpen ? "Close Dice Tray" : "Open Dice Tray"}
                    >
                        <span className={`text-[10px] uppercase font-bold tracking-widest transition-colors ${isDiceTrayOpen ? 'text-amber-500' : 'text-neutral-500 group-hover:text-amber-500'}`}>
                            {isDiceTrayOpen ? 'Close' : 'Roll'}
                        </span>
                        <div className={`w-10 h-10 flex items-center justify-center transition-all duration-300 ${isDiceTrayOpen ? 'rotate-90 scale-110' : 'group-hover:scale-110'}`}>
                            {isDiceTrayOpen ? (
                                <X className="w-8 h-8 text-amber-500 -rotate-90" />
                            ) : (
                                <img src="/icons/dice-d20.svg" alt="Roll" className="w-full h-full brightness-0 invert transition-all group-hover:drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" />
                            )}
                        </div>
                    </button>
                </div>
            </div>

            {/* Navigation Tabs (Unified) */}
            <div className="flex border-b-2 border-black bg-white mb-6 mx-0 md:mx-4 sticky top-24 z-20 shadow-sm md:shadow-none overflow-visible">
                {/* Primary Tabs */}
                {/* Use w-full and split evenly or just flex? User wanted tabs to show if large enough. */}
                <div className="flex flex-1 overflow-hidden">
                    {
                        primaryTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabSelect(tab.id)}
                                className={`flex-1 py-3 md:py-2 text-xs md:text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-2 md:px-4 border-r border-black/10 md:border-black last:border-r-0 md:last:border-r-0
                                ${activeTab === tab.id ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-200'}
                                `}
                            >
                                {tab.label}
                            </button>
                        ))
                    }
                </div>

                {/* Overflow Menu */}
                {secondaryTabs.length > 0 && (
                    <div className="relative border-l-2 border-black flex-none" ref={menuRef}>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className={`h-full px-4 flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs md:text-sm transition-colors
                                ${menuOpen || secondaryTabs.some(t => t.id === activeTab) ? 'bg-black text-white' : 'hover:bg-neutral-200 text-neutral-600'}`}
                        >
                            <span className="hidden sm:inline">More</span>
                            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                        </button>

                        {menuOpen && (
                            <div className="absolute top-full right-0 mt-0 w-48 bg-white border-2 border-black shadow-xl z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                                {secondaryTabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => handleTabSelect(tab.id)}
                                        className={`w-full text-left px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors border-b border-neutral-100 last:border-0
                                            ${activeTab === tab.id ? 'bg-neutral-100 text-black' : 'text-neutral-500 hover:bg-neutral-50 hover:text-black'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 px-4 max-w-5xl mx-auto w-full">

                {activeTab === 'details' && (
                    <DetailsTab
                        actor={actor}
                        systemData={systemData}
                        onUpdate={onUpdate}
                        foundryUrl={foundryUrl}
                        onCreateItem={onCreateItem}
                        onUpdateItem={onUpdateItem}
                        onDeleteItem={onDeleteItem}
                        onToggleEffect={onToggleEffect}
                    />
                )
                }

                {
                    activeTab === 'abilities' && (
                        <AbilitiesTab
                            actor={actor}
                            onUpdate={onUpdate}
                            triggerRollDialog={triggerRollDialog}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                        />
                    )
                }

                {
                    activeTab === 'spells' && (
                        <SpellsTab
                            actor={actor}
                            systemData={systemData}
                            onUpdate={onUpdate}
                            triggerRollDialog={triggerRollDialog}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                            onDeleteItem={onDeleteItem}
                            addNotification={addNotification}
                        />
                    )
                }

                {
                    activeTab === 'talents' && (
                        <TalentsTab
                            actor={actor}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                        />
                    )
                }

                {
                    activeTab === 'inventory' && (
                        <InventoryTab
                            actor={actor}
                            onUpdate={onUpdate}
                            onRoll={onRoll}
                            foundryUrl={foundryUrl}
                            onDeleteItem={onDeleteItem}
                        />
                    )
                }

                {
                    activeTab === 'notes' && (
                        <NotesTab
                            actor={actor}
                            onUpdate={onUpdate}
                        />
                    )
                }

                {
                    activeTab === 'effects' && (
                        <EffectsTab
                            actor={actor}
                            foundryUrl={foundryUrl}
                            onToggleEffect={onToggleEffect}
                            onDeleteEffect={onDeleteEffect}
                        />
                    )
                }

                {/* Debug Data Card */}
                {(actor.debugLevel ?? 0) >= 4 && (
                    <div className="mt-20 border-t border-neutral-200 pt-4">
                        <details className="text-xs font-mono text-neutral-400">
                            <summary className="cursor-pointer mb-2">Debug Data</summary>
                            <pre className="bg-neutral-100 p-4 overflow-auto rounded">{JSON.stringify(actor, null, 2)}</pre>
                        </details>
                    </div>
                )}
            </div >

            <RollDialog
                isOpen={rollDialog.open}
                title={rollDialog.title}
                type={rollDialog.type}
                defaults={rollDialog.defaults}
                onConfirm={(options) => {
                    if (rollDialog.callback) rollDialog.callback(options);
                    setRollDialog(prev => ({ ...prev, open: false }));
                }}
                onClose={() => setRollDialog(prev => ({ ...prev, open: false }))}
            />

            {/* Level-Up Modal */}
            {showLevelUpModal && levelUpData && (
                <LevelUpModal
                    actorId={actor._id || actor.id}
                    actorName={actor.name}
                    currentLevel={levelUpData.currentLevel}
                    targetLevel={levelUpData.targetLevel}
                    ancestry={levelUpData.ancestry}
                    classObj={levelUpData.classObj}
                    classUuid={levelUpData.classUuid}
                    patron={levelUpData.patron}
                    patronUuid={levelUpData.patronUuid}
                    abilities={levelUpData.abilities}
                    spells={levelUpData.spells}
                    availableClasses={systemData?.classes || []}
                    availableLanguages={systemData?.languages || []}
                    foundryUrl={foundryUrl}
                    onComplete={async (data) => {
                        try {
                            // Update Gold if rerolled (Level 0)
                            if (typeof data.gold === 'number' && data.gold >= 0) {
                                await onUpdate('system.coins.gp', data.gold);
                            }

                            const id = actor._id || actor.id;
                            const res = await fetch(`/api/modules/shadowdark/actors/${id}/level-up/finalize`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    hpRoll: data.hpRoll,
                                    items: data.items,
                                    languages: data.languages
                                })
                            });
                            const result = await res.json();
                            if (result.success) {
                                // Show success message and wait for data to stabilize
                                addNotification('Level Up Successful! Updating sheet...', 'success');

                                // Wait for a moment to let the backend process and the UI to acknowledge
                                await new Promise(resolve => setTimeout(resolve, 1500));

                                // Close modal manually after delay, assuming parent will update via polling/socket
                                setShowLevelUpModal(false);
                                setLevelUpData(null);

                                // Trigger a soft data refresh if possible (parent handles polling)
                            } else {
                                addNotification('Level-up failed: ' + (result.error || 'Unknown error'), 'error');
                            }
                        } catch (e: any) {
                            console.error('Level-up error:', e);
                            addNotification('Level-up failed: ' + e.message, 'error');
                        }
                    }}
                    onCancel={() => {
                        setShowLevelUpModal(false);
                        setLevelUpData(null);
                    }}
                />
            )}
            <NotificationContainer notifications={notifications} removeNotification={removeNotification} />
        </div >
    );
}
