'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import RollDialog from '@client/ui/components/RollDialog';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingModal from '@client/ui/components/LoadingModal';
import { shadowdarkTheme } from './themes/shadowdark';
import { useNotifications, NotificationContainer } from '@client/ui/components/NotificationSystem';

import { calculateSpellBonus } from './sheet-utils';
import { shouldShowSpellsTab } from '../logic/rules';
import { Menu, X, Check } from 'lucide-react';
import { useConfig } from '@client/ui/context/ConfigContext';
import dynamic from 'next/dynamic';
import { ShadowdarkUIProvider, useShadowdarkUI } from './context/ShadowdarkUIContext';
import { useShadowdarkActor } from './context/ShadowdarkActorContext';

// Sub-components
import InventoryTab from './InventoryTab';
import SpellsTab from './SpellsTab';
import TalentsTab from './TalentsTab';
import AbilitiesTab from './AbilitiesTab';
import DetailsTab from './DetailsTab';
import EffectsTab from './EffectsTab';
import NotesTab from './NotesTab';

const LevelUpModal = dynamic(() => import('./components/LevelUpModal').then(mod => mod.LevelUpModal), { 
    ssr: false,
    loading: () => <LoadingModal message="Loading Level Up System..." />
});

import ShadowdarkPaperSheet from './ShadowdarkPaperSheet';
import { logger } from '@shared/utils/logger';

interface ShadowdarkSheetProps {
    token?: string | null;
    onToggleDiceTray?: () => void;
    isDiceTrayOpen?: boolean;
}

export default function ShadowdarkSheet(props: ShadowdarkSheetProps) {
    const { 
        token, 
        onToggleDiceTray, 
        isDiceTrayOpen 
    } = props;

    const { 
        actor, 
        getDraftValue, 
        updateActor, 
        rollDialog, 
        closeRollDialog,
        refreshActor,
        // Level-up — single shared instance from ShadowdarkActorContext
        triggerLevelUp,
        showLevelUpModal,
        levelUpData,
        closeLevelUp
    } = useShadowdarkActor();
    
    const { resolveImageUrl } = useConfig();
    const { systemData, loadingSystem, resolveName } = useShadowdarkUI();

    // UI state
    const [activeTab, setActiveTab] = useState('details');
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { notifications, addNotification, removeNotification } = useNotifications();

    const [viewMode, setViewMode] = useState<'simple' | 'advanced'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('shadowdark_view_mode') as 'simple' | 'advanced';
            if (saved === 'simple' || saved === 'advanced') return saved;
        }
        return 'simple';
    });

    const handleToggleView = (mode: 'simple' | 'advanced') => {
        setViewMode(mode);
        if (typeof window !== 'undefined') {
            localStorage.setItem('shadowdark_view_mode', mode);
        }
    };

    // Session state for active tab and menu

    // System manifest fetching is now handled by ShadowdarkUIProvider.



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
    const getVisibleCount = useCallback((width: number) => {
        if (width < 640) return 3;
        if (width < 1024) return 5;
        return tabsOrder.length;
    }, [tabsOrder.length]);

    useEffect(() => {
        const handleResize = () => {
            let currentTabs = [...tabsOrder];

            // Spellcaster check: prefer pre-computed value on actor, fall back to rules function.
            // No extra API call needed — this is already determined during normalization.
            const showSpells = actor.computed?.showSpellsTab || shouldShowSpellsTab(actor);

            if (!showSpells) {
                currentTabs = currentTabs.filter(t => t.id !== 'spells');
            }

            const count = getVisibleCount(window.innerWidth);

            setVisibleTabs(currentTabs.slice(0, count));
            setOverflowTabs(currentTabs.slice(count));
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [tabsOrder, actor, getVisibleCount]);

    // Level Up Modal is handled via hook

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
        <div className={`flex flex-col h-full relative pb-0 font-crimson font-inter font-sans ${viewMode === 'simple' ? 'bg-black' : 'bg-neutral-100'} text-black`}>
            {/* Loading Overlay */}
            <LoadingModal message="Loading System Data..." visible={loadingSystem} theme={shadowdarkTheme.loadingModal} />

            {viewMode === 'simple' ? (
                <ShadowdarkPaperSheet
                    onToggleView={() => {
                        handleToggleView('advanced');
                    }}
                />
            ) : (
                <>

                    {/* Header / Top Nav */}
                    <div className="bg-neutral-900 text-white shadow-md sticky top-0 z-10 flex flex-col md:flex-row items-stretch justify-between mb-6 border-b-4 border-black min-h-[6rem] transition-all">
                        <div className="flex items-center gap-4 md:gap-6 p-4 md:p-0 md:pl-0 w-full md:w-auto border-b md:border-b-0 border-white/10 md:border-none">
                            <img
                                src={resolveImageUrl(actor.img)}
                                alt={actor.name}
                                className="h-16 w-16 md:h-24 md:w-24 object-cover border-r-2 border-white/10 bg-neutral-800 shrink-0"
                            />
                            <div className="py-2 flex-1 flex flex-row items-center justify-between md:block">
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-serif font-bold leading-none tracking-tight">{actor.name}</h1>
                                    <div className="flex flex-col md:flex-row md:items-center gap-x-3 gap-y-1">
                                        <p className="text-xs text-neutral-400 font-sans tracking-widest uppercase mt-1">
                                            {actor.details?.title && <span className="text-amber-500 mr-2">{actor.details.title}</span>}
                                            {actor.details?.ancestry || ''} {actor.details?.class || ''}
                                        </p>
                                        <button
                                            onClick={() => {
                                                handleToggleView('simple');
                                            }}
                                            className="text-[10px] text-amber-500 hover:text-amber-400 font-bold uppercase tracking-widest mt-1 border border-amber-500/30 px-2 py-0.5 rounded w-fit"
                                        >
                                            View Single Page Sheet
                                        </button>
                                    </div>
                                </div>
                                {/* Level displayed inline on mobile for space or block on desktop */}
                                <div className="text-xl font-bold font-serif md:hidden flex flex-col items-end">
                                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest leading-none">Level</span>
                                    <span>{actor.system?.level?.value !== undefined ? actor.system.level.value : ''}</span>
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
                                    onClick={triggerLevelUp}
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
                                            type="number"
                                            value={getDraftValue('system.attributes.hp.value', actor.system.attributes.hp.value)}
                                            onChange={(e) => {
                                                let val = parseInt(e.target.value) || 0;
                                                const max = actor.computed?.maxHp ?? actor.system?.attributes?.hp?.max ?? 1;
                                                if (val > max) val = max;
                                                // Debounced update
                                                updateActor('system.attributes.hp.value', val);
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
                                    <span className="font-serif font-bold text-xl md:text-2xl">{actor.computed?.ac ?? actor.system?.attributes?.ac?.value ?? 10}</span>
                                </div>
                            )}
                            <button
                                onClick={() => onToggleDiceTray?.()}
                                className="ml-4 transition-all duration-300 hover:scale-110 active:scale-95 group shrink-0"
                                title="Open Dice Tray"
                            >
                                <img
                                    src="/icons/dice-d20.svg"
                                    className="w-14 h-14 invert opacity-70 group-hover:opacity-100 transition-all"
                                    alt="Roll d20"
                                />
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
                                ${menuOpen || secondaryTabs.some(t => t.id === activeTab) ? 'bg-black text-white' : 'hover:bg-neutral-800 text-neutral-400'}`}
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
                            <DetailsTab />
                        )
                        }

                        {
                            activeTab === 'abilities' && (
                                <AbilitiesTab />
                            )
                        }

                        {
                            activeTab === 'spells' && (
                                <ErrorBoundary fallback={<div>Error loading Spells Tab. Check console.</div>}>
                                    <SpellsTab />
                                </ErrorBoundary>
                            )
                        }

                        {
                            activeTab === 'talents' && (
                                <TalentsTab />
                            )
                        }

                        {
                            activeTab === 'inventory' && (
                                <InventoryTab />
                            )
                        }

                        {
                            activeTab === 'notes' && (
                                <NotesTab />
                            )
                        }

                        {
                            activeTab === 'effects' && (
                                <EffectsTab />
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
                    </div>
                </>
            )}

            <RollDialog
                isOpen={rollDialog.open}
                title={rollDialog.title}
                type={rollDialog.type}
                defaults={rollDialog.defaults}
                theme={shadowdarkTheme.rollDialog}
                onConfirm={(options) => {
                    if (rollDialog.callback) rollDialog.callback(options);
                }}
                onClose={closeRollDialog}
            />

            {/* Level-Up Modal */}
            {
                showLevelUpModal && levelUpData && (
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
                        availableClasses={levelUpData.availableClasses}
                        availablePatrons={levelUpData.availablePatrons}
                        availableLanguages={levelUpData.availableLanguages}
                        onComplete={async (_data: any) => {
                            // Backend finalize already handled data
                            addNotification('Level Up Successful! Updating sheet...', 'success');
                            await refreshActor();
                            closeLevelUp();
                        }}
                        onCancel={closeLevelUp}
                    />
                )
            }
            <NotificationContainer notifications={notifications} removeNotification={removeNotification} />
        </div >
    );
}
