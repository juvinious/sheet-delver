import { useState, useEffect, useCallback } from 'react';
import { resolveEntityUuid } from '../sheet-utils';

/**
 * Shared hook to manage the Shadowdark Level-Up process.
 * Encapsulates modal state, data assembly, and auto-closing logic.
 */
export function useShadowdarkLevelUp(
    actor: any, 
    systemData: any, 
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void
) {
    const [showLevelUpModal, setShowLevelUpModal] = useState(false);
    const [levelUpData, setLevelUpData] = useState<any>(null);

    // Auto-close Level Up Modal when level effectively changes in the background
    useEffect(() => {
        if (showLevelUpModal && levelUpData && actor.system?.level?.value === levelUpData.targetLevel) {
            setShowLevelUpModal(false);
            setLevelUpData(null);
            addNotification('Level Up Complete!', 'success');
        }
    }, [actor.system?.level?.value, showLevelUpModal, levelUpData, addNotification]);

    /**
     * Prepares level-up data and opens the modal.
     */
    const triggerLevelUp = useCallback(() => {
        const currentLevel = actor.system?.level?.value || 0;
        const targetLevel = currentLevel + 1;
        
        const data = {
            currentLevel,
            targetLevel,
            classObj: actor.computed?.classDetails,
            ancestry: actor.system?.ancestry,
            patron: actor.computed?.patronDetails,
            abilities: actor.system?.abilities,
            spells: actor.items?.filter((i: any) => i.type === 'Spell') || [],
            // If Level 0, force empty classUuid so modal prompts for class selection
            classUuid: currentLevel === 0 ? "" : resolveEntityUuid(actor.system?.class || '', systemData, 'classes'),
            patronUuid: resolveEntityUuid(actor.system?.patron || '', systemData, 'patrons')
        };
        
        setLevelUpData(data);
        setShowLevelUpModal(true);
    }, [actor, systemData]);

    const closeLevelUp = useCallback(() => {
        setShowLevelUpModal(false);
        setLevelUpData(null);
    }, []);

    return {
        showLevelUpModal,
        levelUpData,
        triggerLevelUp,
        closeLevelUp
    };
}
