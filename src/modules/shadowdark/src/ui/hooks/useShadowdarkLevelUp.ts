import { useState, useEffect, useCallback } from 'react';
import { resolveEntityUuid } from '../sheet-utils';

/**
 * Shared hook to manage the Shadowdark Level-Up process.
 * Encapsulates modal state, data assembly, and auto-closing logic.
 */
export function useShadowdarkLevelUp(
    actor: any, 
    systemData: any, 
    addNotification: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void,
    onFetchPack?: (packId: string) => Promise<any>
) {
    const [showLevelUpModal, setShowLevelUpModal] = useState(false);
    const [levelUpData, setLevelUpData] = useState<any>(null);
    const [isFetching, setIsFetching] = useState(false);

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
    const triggerLevelUp = useCallback(async () => {
        const currentLevel = actor.system?.level?.value || 0;
        const targetLevel = currentLevel + 1;
        
        let currentSystemData = systemData;

        // Ensure hydration for base essentials needed for level-up resolution
        if (onFetchPack) {
            setIsFetching(true);
            try {
                const results = await Promise.all([
                    !currentSystemData?.classes ? onFetchPack('classes') : Promise.resolve(currentSystemData),
                    !currentSystemData?.patrons ? onFetchPack('patrons') : Promise.resolve(currentSystemData)
                ]);
                // Merge results if needed (the setSystemData in parent handles this, 
                // but we need latest for resolveEntityUuid in next step)
                currentSystemData = results[0]; 
            } finally {
                setIsFetching(false);
            }
        }

        const data = {
            currentLevel,
            targetLevel,
            classObj: actor.computed?.classDetails,
            ancestry: actor.system?.ancestry,
            patron: actor.computed?.patronDetails,
            abilities: actor.system?.abilities,
            spells: actor.items?.filter((i: any) => i.type === 'Spell') || [],
            // If Level 0, force empty classUuid so modal prompts for class selection
            classUuid: currentLevel === 0 ? "" : resolveEntityUuid(actor.system?.class || '', currentSystemData, 'classes'),
            patronUuid: resolveEntityUuid(actor.system?.patron || '', currentSystemData, 'patrons')
        };
        
        setLevelUpData(data);
        setShowLevelUpModal(true);
    }, [actor, systemData, onFetchPack]);

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
