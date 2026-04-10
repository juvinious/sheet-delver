// Re-export shared logic from lib
import { calculateItemSlots, calculateMaxSlots, calculateCoinSlots, calculateGemSlots } from '../logic/rules';
export { calculateItemSlots, calculateMaxSlots, calculateCoinSlots, calculateGemSlots };

import { resolveImage, processHtmlContent, getSafeDescription } from '@modules/registry/client';
export { resolveImage, processHtmlContent, getSafeDescription };

import { resolveDocumentName, formatDescription } from '../logic/normalization';
export { formatDescription };

/**
 * Resolves a potentially UUID-based field (like class, ancestry, background) to a human-readable name.
 */
export const resolveEntityName = (value: string, actor: any, systemData: any, _collectionName?: string): string => {
    if (!value) return '';

    // 1. Try to find an embedded Item on the actor matching ID or UUID
    const embeddedItem = actor.items?.find((i: any) =>
        i.id === value ||
        i.uuid === value ||
        (typeof value === 'string' && value.endsWith(i.id || i._id))
    );
    if (embeddedItem) return embeddedItem.name;

    // 2. Use unified resolver
    return resolveDocumentName(value, systemData);
};

/**
 * Resolves a value (Name or UUID) to a Canonical UUID from the system data.
 */
export const resolveEntityUuid = (value: string, systemData: any, collectionName: string): string => {
    if (!value) return '';
    if (value.includes('.') && value.length > 16) return value;

    if (systemData && systemData[collectionName]) {
        const sysObj = systemData[collectionName].find((c: any) => 
            c.name === value || c.uuid === value || c._id === value || c.id === value
        );
        if (sysObj) return sysObj.uuid || sysObj._id || sysObj.id;
    }

    return value;
};

export const calculateSpellBonus = (actor: any, spell?: any): { bonus: number, advantage: boolean, disadvantage: boolean } => {
    if (!actor || !actor.system) return { bonus: 0, advantage: false, disadvantage: false };

    let bonus = 0;
    let advantage = false;
    const disadvantage = false;

    // 1. General Spellcasting Check Bonus
    bonus += Number(actor.system.bonuses?.spellcastingCheckBonus) || 0;

    // 2. Spell-Specific Advantage
    if (spell && actor.system.bonuses?.advantage) {
        const adv = actor.system.bonuses.advantage;
        const spellName = spell.name?.toLowerCase() || "";

        // Match specific spell name or generic "spellcasting"
        if (adv === "spellcasting" || adv === spellName || (Array.isArray(adv) && (adv.includes("spellcasting") || adv.includes(spellName)))) {
            advantage = true;
        }
    }

    // 3. Class-Specific Bonuses (Placeholder for future precise mapping if needed)
    // Note: Most Shadowdark talents apply to the general spellcastingCheckBonus.

    return { bonus, advantage, disadvantage };
};

/**
 * Calculate XP required to reach a given level.
 * Formula: level * 10
 */
export const calculateXPForLevel = (level: number): number => {
    return level * 10;
};

/**
 * Calculate XP carryover after leveling up.
 * Excess XP carries over to next level (except from level 0).
 */
export const calculateXPCarryover = (currentXP: number, currentLevel: number): number => {
    if (currentLevel === 0) return 0;
    return currentXP - (currentLevel * 10);
};

/**
 * Determine if a character gains a talent at the target level.
 * Talents are gained on odd levels (1, 3, 5, 7, 9).
 */
export const shouldGainTalent = (targetLevel: number): boolean => {
    return targetLevel % 2 !== 0;
};
