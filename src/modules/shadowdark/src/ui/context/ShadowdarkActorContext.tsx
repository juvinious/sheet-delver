'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@shared/utils/logger';
import { useShadowdarkUI } from './ShadowdarkUIContext';
import { calculateSpellBonus } from '../sheet-utils';
import { useNotifications } from '@client/ui/components/NotificationSystem';
import { useShadowdarkLevelUp } from '../hooks/useShadowdarkLevelUp';

/**
 * ShadowdarkActorContext
 * 
 * Centralized state management for the active Shadowdark character.
 * Handles:
 * 1. Actor state synchronization.
 * 2. Drafting system for numeric/text inputs (prevents race conditions).
 * 3. Unified transactional handlers (Rolls, Updates, CRUD).
 * 4. Global saving indicators.
 */

interface ShadowdarkActorState {
    actor: any | null;
    isSaving: boolean;
    // Handlers
    updateActor: (path: string, value: any, options?: { immediate?: boolean }) => Promise<void>;
    updateItem: (itemData: any, deletedEffectIds?: string[]) => Promise<void>;
    deleteItem: (itemId: string) => Promise<void>;
    createItem: (itemData: any) => Promise<void>;
    performRoll: (type: string, key: string, options?: any) => Promise<void>;
    // Active Effects
    toggleEffect: (effectId: string, enabled: boolean) => Promise<void>;
    deleteEffect: (effectId: string) => Promise<void>;
    createEffect: (effectData: any) => Promise<void>;
    updateEffect: (effectData: any) => Promise<void>;
    addPredefinedEffect: (effectId: string) => Promise<void>;
    // Helper to get a value that might be in a "draft" state
    getDraftValue: (path: string, fallback: any) => any;
    // Roll Dialog
    rollDialog: {
        open: boolean;
        title: string;
        type: 'attack' | 'ability' | 'spell';
        defaults: any;
        callback: ((options: any) => void) | null;
    };
    triggerRollDialog: (type: string, key: string, options?: any) => void;
    closeRollDialog: () => void;
    // Refresh
    refreshActor: () => Promise<void>;
    // Level-Up (single shared instance — no redundant hook calls in children)
    triggerLevelUp: () => void;
    showLevelUpModal: boolean;
    levelUpData: any;
    closeLevelUp: () => void;
}

const ShadowdarkActorContext = createContext<ShadowdarkActorState | undefined>(undefined);

export function ShadowdarkActorProvider({ 
    children, 
    actor: initialActor,
    onUpdate,
    onDeleteItem,
    onCreateItem,
    onUpdateItem,
    onRoll,
    onToggleEffect,
    onDeleteEffect,
    onCreateEffect,
    onUpdateEffect,
    onAddPredefinedEffect,
    onRefresh
}: { 
    children: React.ReactNode; 
    actor: any;
    onUpdate: (path: string, value: any) => Promise<void>;
    onDeleteItem: (itemId: string) => Promise<void>;
    onCreateItem: (itemData: any) => Promise<void>;
    onUpdateItem: (itemData: any, deletedEffectIds?: string[]) => Promise<void>;
    onRoll: (type: string, key: string, options?: any) => Promise<void>;
    onToggleEffect: (effectId: string, enabled: boolean) => Promise<void>;
    onDeleteEffect: (effectId: string) => Promise<void>;
    onCreateEffect: (effectData: any) => Promise<void>;
    onUpdateEffect: (effectData: any) => Promise<void>;
    onAddPredefinedEffect: (effectId: string) => Promise<void>;
    onRefresh: () => Promise<void>;
}) {
    const [actor, setActor] = useState(initialActor);
    const { resolveName } = useShadowdarkUI();
    const [isSaving, setIsSaving] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, any>>({});
    const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());

    // Notifications — used by the level-up hook below
    const { addNotification } = useNotifications();

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
    
    // Use refs for debouncing to prevent stale closures
    const updateTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

    // Sync state when props change (socket updates)
    useEffect(() => {
        setActor(initialActor);
        
        // When the server updates, we check if any drafts have been reconciled
        // If the server value matches the draft value, we can "clear" the draft 
        // to avoid staying in a stale visual state.
        setDrafts(prev => {
            const next = { ...prev };
            let changed = false;
            
            Object.keys(next).forEach(path => {
                const serverVal = getDeepValue(initialActor, path);
                if (serverVal === next[path]) {
                    delete next[path];
                    changed = true;
                }
            });
            
            return changed ? next : prev;
        });
    }, [initialActor]);

    // Unified Update Handler
    const updateActor = useCallback(async (path: string, value: any, options: { immediate?: boolean } = {}) => {
        // Update local draft immediately for UI responsiveness
        setDrafts(prev => ({ ...prev, [path]: value }));
        
        if (options.immediate) {
            setIsSaving(true);
            try {
                await onUpdate(path, value);
            } catch (err) {
                logger.error(`[ShadowdarkActorContext] Failed to update ${path}:`, err);
            } finally {
                setIsSaving(false);
            }
        } else {
            // Debounced update
            if (updateTimeoutRef.current[path]) {
                clearTimeout(updateTimeoutRef.current[path]);
            }
            
            updateTimeoutRef.current[path] = setTimeout(async () => {
                setIsSaving(true);
                try {
                    await onUpdate(path, value);
                } catch (err) {
                    logger.error(`[ShadowdarkActorContext] Debounced update failed for ${path}:`, err);
                } finally {
                    setIsSaving(false);
                    delete updateTimeoutRef.current[path];
                }
            }, 1000); // 1s debounce for typing
        }
    }, [onUpdate]);

    const updateItem = useCallback(async (itemData: any, deletedEffectIds?: string[]) => {
        setIsSaving(true);
        try {
            await onUpdateItem(itemData, deletedEffectIds);
        } finally {
            setIsSaving(false);
        }
    }, [onUpdateItem]);

    const deleteItem = useCallback(async (itemId: string) => {
        setIsSaving(true);
        setOptimisticDeletedIds(prev => new Set(prev).add(itemId));
        try {
            await onDeleteItem(itemId);
        } finally {
            setIsSaving(false);
        }
    }, [onDeleteItem]);

    const createItem = useCallback(async (itemData: any) => {
        setIsSaving(true);
        try {
            await onCreateItem(itemData);
        } finally {
            setIsSaving(false);
        }
    }, [onCreateItem]);

    const performRoll = useCallback(async (type: string, key: string, options?: any) => {
        // We don't track isSaving for rolls as they are non-transactional to state
        await onRoll(type, key, options);
    }, [onRoll]);

    const toggleEffect = useCallback(async (effectId: string, enabled: boolean) => {
        setIsSaving(true);
        try {
            await onToggleEffect(effectId, enabled);
        } finally {
            setIsSaving(false);
        }
    }, [onToggleEffect]);

    const deleteEffect = useCallback(async (effectId: string) => {
        setIsSaving(true);
        try {
            await onDeleteEffect(effectId);
        } finally {
            setIsSaving(false);
        }
    }, [onDeleteEffect]);

    const createEffect = useCallback(async (effectData: any) => {
        setIsSaving(true);
        try {
            await onCreateEffect(effectData);
        } finally {
            setIsSaving(false);
        }
    }, [onCreateEffect]);

    const updateEffect = useCallback(async (effectData: any) => {
        setIsSaving(true);
        try {
            await onUpdateEffect(effectData);
        } finally {
            setIsSaving(false);
        }
    }, [onUpdateEffect]);

    const addPredefinedEffect = useCallback(async (effectId: string) => {
        setIsSaving(true);
        try {
            await onAddPredefinedEffect(effectId);
        } finally {
            setIsSaving(false);
        }
    }, [onAddPredefinedEffect]);

    const refreshActor = useCallback(async () => {
        setIsSaving(true);
        try {
            await onRefresh();
        } finally {
            setIsSaving(false);
        }
    }, [onRefresh]);

    // Level-Up — single shared instance for the entire sheet tree
    const { triggerLevelUp, showLevelUpModal, levelUpData, closeLevelUp } =
        useShadowdarkLevelUp(actor, addNotification as any);

    const getDraftValue = useCallback((path: string, fallback: any) => {
        return drafts[path] !== undefined ? drafts[path] : fallback;
    }, [drafts]);

    const triggerRollDialog = useCallback((type: string, key: string, options: any = {}) => {
        let dialogType: 'attack' | 'ability' | 'spell' = 'attack';
        let title = '';
        const defaults: any = {};

        if (options.handedness) defaults.handedness = options.handedness;

        if (type === 'ability') {
            dialogType = 'ability';
            title = `${key.toUpperCase().replace('ABILITY', '')} Ability Check`;
            const stat = actor.stats?.[key] || {};
            defaults.abilityBonus = stat.mod || 0;
        } else if (type === 'item') {
            let item = actor.items?.find((i: any) => i.id === key || i._id === key);

            // Fallback: Look in systemData (Compendium) for spells using centralized resolver
            if (!item) {
                const name = resolveName(key, 'spells');
                if (name && name !== key) {
                    // We found something! It's a "virtual" spell not on the actor
                    item = { 
                        name,
                        uuid: key,
                        type: 'Spell',
                        system: { description: '' } 
                    };
                }
            }

            if (item) {
                const itemRef = item.id || item._id;
                const isVirtual = !actor.items?.some((i: any) => i.id === itemRef || i._id === itemRef);
                if (isVirtual) {
                    defaults.itemData = item;
                }

                if (item.type === 'Spell') {
                    dialogType = 'spell';
                    title = `Cast Spell: ${item.name}`;
                    
                    const getAbilityForClass = (classes: string[] | string) => {
                        const classArray = Array.isArray(classes) ? classes : [classes];
                        const classNames = classArray.map(c => c?.toLowerCase() || "");

                        const possibleAbilities: string[] = [];
                        if (classNames.some(c => c.includes('wizard'))) possibleAbilities.push('int');
                        if (classNames.some(c => c.includes('priest') || c.includes('druid') || c.includes('seer'))) possibleAbilities.push('wis');
                        if (classNames.some(c => c.includes('bard') || c.includes('warlock') || c.includes('witch'))) possibleAbilities.push('cha');

                        if (possibleAbilities.length === 0) return null;

                        const actorAbility = actor.computed?.spellcastingAbility?.toLowerCase();
                        if (actorAbility && possibleAbilities.includes(actorAbility)) return actorAbility;

                        return possibleAbilities[0];
                    };

                    const spellClass = item.system?.class || item.class;
                    const classAbility = spellClass ? getAbilityForClass(spellClass) : null;
                    const statKey = item.system?.ability || classAbility || actor.computed?.spellcastingAbility || 'int';

                    const stat = actor.stats?.[statKey.toLowerCase()] || {};
                    defaults.abilityBonus = stat.mod || 0;

                    const spellBonus = calculateSpellBonus(actor, item);
                    defaults.talentBonus = spellBonus.bonus;

                    defaults.showItemBonus = false;
                } else {
                    dialogType = 'attack';
                    title = `Roll Attack with ${item.name}`;
                    const isFinesse = item.system?.properties?.some((p: any) => p.toLowerCase().includes('finesse'));
                    const isThrown = item.system?.properties?.some((p: any) => typeof p === 'string' && p.toLowerCase().includes('thrown'));
                    const isRangedType = item.system?.type === 'ranged';
                    const hasRange = item.system?.range === 'near' || item.system?.range === 'far';

                    let isRanged = options.attackType === 'Ranged' || options.attackType === 'ranged';

                    if (options.attackType === undefined || options.attackType === null) {
                        isRanged = isRangedType || hasRange || (item.system?.type === 'melee' && isThrown);
                    }

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
            callback: (rollOptions) => {
                const finalOptions = { ...rollOptions };
                if (defaults.itemData) finalOptions.itemData = defaults.itemData;
                if (defaults.handedness) finalOptions.handedness = defaults.handedness;
                performRoll(type, key, finalOptions);
                closeRollDialog();
            }
        });
    }, [actor, resolveName, performRoll]);

    const closeRollDialog = useCallback(() => {
        setRollDialog(prev => ({ ...prev, open: false, callback: null }));
    }, []);

    // Filter optimistically deleted items to ensure immediate frontend reactivity
    // independent of network latency or stale responses
    const computedActor = React.useMemo(() => {
        if (!actor) return null;
        if (optimisticDeletedIds.size === 0) return actor;
        
        return {
            ...actor,
            items: (actor.items || []).filter((i: any) => !optimisticDeletedIds.has(i.id) && !optimisticDeletedIds.has(i._id))
        };
    }, [actor, optimisticDeletedIds]);

    const value = {
        actor: computedActor,
        isSaving,
        updateActor,
        updateItem,
        deleteItem,
        createItem,
        performRoll,
        getDraftValue,
        toggleEffect,
        deleteEffect,
        createEffect,
        updateEffect,
        addPredefinedEffect,
        refreshActor,
        // Level-Up shared state
        triggerLevelUp,
        showLevelUpModal,
        levelUpData,
        closeLevelUp,
        rollDialog,
        triggerRollDialog,
        closeRollDialog
    };

    return (
        <ShadowdarkActorContext.Provider value={value}>
            {children}
        </ShadowdarkActorContext.Provider>
    );
}

export function useShadowdarkActor() {
    const context = useContext(ShadowdarkActorContext);
    if (context === undefined) {
        throw new Error('useShadowdarkActor must be used within a ShadowdarkActorProvider');
    }
    return context;
}

// Utility to get deep nested values by string path (e.g. "system.attributes.hp.value")
function getDeepValue(obj: any, path: string) {
    return path.split('.').reduce((prev, curr) => {
        return prev ? prev[curr] : undefined;
    }, obj);
}
