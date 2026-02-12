
import { logger } from '../../../core/logger';

// Map of Item ID (or Source ID) to Overrides
const ITEM_OVERRIDES: Record<string, (item: any) => void> = {
    // Staff (Gear)
    '9eTpsuEuzL3Vaxge': (item: any) => {
        // Remove Two-Handed
        if (item.system.properties) {
            item.system.properties = item.system.properties.filter((p: string) => !p.includes('b6Gm2ULKj2qyy2xJ'));
            // Add Versatile if not present
            if (!item.system.properties.some((p: string) => p.includes('qEIYaQ9j2EUmSrx6'))) {
                item.system.properties.push('Compendium.shadowdark.properties.Item.qEIYaQ9j2EUmSrx6');
            }
        }
        // Fix Damage
        if (item.system.damage) {
            item.system.damage.oneHanded = 'd4';
            item.system.damage.twoHanded = 'd6';
        }
    },
    // Warhammer (Gear)
    'z98LNu4yOIe1B1eg': (item: any) => {
        if (item.system.properties) {
            item.system.properties = item.system.properties.filter((p: string) => !p.includes('b6Gm2ULKj2qyy2xJ'));
            if (!item.system.properties.some((p: string) => p.includes('qEIYaQ9j2EUmSrx6'))) {
                item.system.properties.push('Compendium.shadowdark.properties.Item.qEIYaQ9j2EUmSrx6');
            }
        }
        if (item.system.damage) {
            item.system.damage.oneHanded = 'd8';
            item.system.damage.twoHanded = 'd10';
        }
    },
    // Staff of Healing (Magic Item)
    'jEeDexWHYy7wKsfa': (item: any) => {
        if (item.system.properties) {
            item.system.properties = item.system.properties.filter((p: string) => !p.includes('b6Gm2ULKj2qyy2xJ'));
            if (!item.system.properties.some((p: string) => p.includes('qEIYaQ9j2EUmSrx6'))) {
                item.system.properties.push('Compendium.shadowdark.properties.Item.qEIYaQ9j2EUmSrx6');
            }
        }
        if (item.system.damage) {
            item.system.damage.oneHanded = 'd4';
            item.system.damage.twoHanded = 'd6';
        }
        // Inject Spell Link if missing - Standardizing to long UUID with .Item.
        const spellLink = '@UUID[Compendium.shadowdark.spells.Item.N9NvonT0RL6PyiiV]{Cure Wounds}';
        if (item.system.description && !item.system.description.includes('Compendium.shadowdark.spells.Item.N9NvonT0RL6PyiiV')) {
            item.system.description += `<p><strong>Spell:</strong> ${spellLink}</p>`;
        }
    },
    // Wand of Blind/Deafen (Magic Item)
    'yyUwr6H9imWcJ9YS': (item: any) => {
        // Standardize the existing description link
        const oldLink = '@UUID[Compendium.shadowdark.spells.ItoZZ0nli29N5d7G]';
        const newLink = '@UUID[Compendium.shadowdark.spells.Item.ItoZZ0nli29N5d7G]';
        if (item.system.description && item.system.description.includes(oldLink) && !item.system.description.includes(newLink)) {
            item.system.description = item.system.description.replace(oldLink, newLink);
        }
    },
    // Scroll of Burning Hands
    'N27A6nb0epkHZ3lR': (item: any) => {
        const oldLink = '@UUID[Compendium.shadowdark.spells.ItN82uLU3PhJFLNm]';
        const newLink = '@UUID[Compendium.shadowdark.spells.Item.ItN82uLU3PhJFLNm]'; // Notice the typo check: ItN8... should be Item.ItN8...
        // Wait, the spell ID is actually ItN82uLU3PhJFLNm? Let me verify.
        if (item.system.description && item.system.description.includes(oldLink) && !item.system.description.includes(newLink)) {
            item.system.description = item.system.description.replace(oldLink, newLink);
        }
    },
    // Scroll of Hold Portal
    'mXkpNk8z0eZU8kKj': (item: any) => {
        const oldLink = '@UUID[Compendium.shadowdark.spells.q600IZtPTAgkz6vB]';
        const newLink = '@UUID[Compendium.shadowdark.spells.Item.q600IZtPTAgkz6vB]';
        if (item.system.description && item.system.description.includes(oldLink) && !item.system.description.includes(newLink)) {
            item.system.description = item.system.description.replace(oldLink, newLink);
        }
    }
};

export function applyItemDataOverrides(item: any) {
    if (!item || !item.system) return;

    // Check by Source ID (flags.core.sourceId) or ID
    const sourceId = item.flags?.core?.sourceId;
    let key = '';

    if (sourceId) {
        // Source ID format: Compendium.shadowdark.gear.Item.ID
        const parts = sourceId.split('.');
        const id = parts[parts.length - 1];
        if (ITEM_OVERRIDES[id]) key = id;
    }

    if (!key && ITEM_OVERRIDES[item.id || item._id]) {
        key = item.id || item._id;
    }

    // Fallback: Name matching
    if (!key) {
        if (item.name === 'Staff') key = '9eTpsuEuzL3Vaxge';
        else if (item.name === 'Warhammer') key = 'z98LNu4yOIe1B1eg';
        else if (item.name === 'Staff of Healing') key = 'jEeDexWHYy7wKsfa';
        else if (item.name === 'Scroll of Burning Hands') key = 'N27A6nb0epkHZ3lR';
        else if (item.name === 'Scroll of Hold Portal') key = 'mXkpNk8z0eZU8kKj';
        else if (item.name === 'Wand of Blind/Deafen') key = 'yyUwr6H9imWcJ9YS';
    }

    if (key) {
        try {
            ITEM_OVERRIDES[key](item);
        } catch (e) {
            logger.error(`[ItemOverrides] Failed to apply overrides for ${item.name} (${key})`, e);
        }
    }
}

export function getItemSpells(item: any): any[] {
    const description = item.system?.description || '';
    if (!description) return [];

    const spells: any[] = [];
    // Regex to match Foundry UUID links: @UUID[Compendium.shadowdark.spells.UUID]{Name}
    // Also handling potential variations or lack of {Name}
    const uuidPattern = /@UUID\[(Compendium\.shadowdark\.spells\.[^\]]+)\](?:\{([^}]+)\})?/g;

    let match;
    while ((match = uuidPattern.exec(description)) !== null) {
        const uuid = match[1];
        // If name is captured in group 2, use it. Otherwise, extract from UUID or default.
        // Usually UUID is Compendium.shadowdark.spells.ID
        let name = match[2];

        if (!name) {
            // Fallback: This is not ideal as we don't have the dictionary, but let's just use "Spell Link" 
            // or assume the UI handles UUIDs gracefully if name is missing.
            // However, our UI expects { name, uuid }.
            name = 'Unknown Spell';
        }

        spells.push({ uuid, name });
    }

    return spells;
}
