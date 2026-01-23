
// Re-export shared logic from lib
import { calculateItemSlots, calculateMaxSlots } from '../rules';
export { calculateItemSlots, calculateMaxSlots };

export const resolveImage = (path: string, foundryUrl?: string) => {
    if (!path) return '/placeholder.png';
    if (path.startsWith('http') || path.startsWith('data:')) return path;

    if (foundryUrl) {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        const cleanUrl = foundryUrl.endsWith('/') ? foundryUrl : `${foundryUrl}/`;
        return `${cleanUrl}${cleanPath}`;
    }
    return path;
};

export const processHtmlContent = (html: string, foundryUrl?: string) => {
    if (!html) return '';
    let processed = html;

    // Fix relative image src
    if (foundryUrl) {
        processed = processed.replace(/src="([^"]+)"/g, (match, src) => {
            // Skip absolute URLs or data URIs
            if (src.startsWith('http') || src.startsWith('data:')) return match;

            // Clean paths
            const cleanPath = src.startsWith('/') ? src.slice(1) : src;
            const cleanBase = foundryUrl.endsWith('/') ? foundryUrl : `${foundryUrl}/`;
            return `src="${cleanBase}${cleanPath}"`;
        });
    }

    return processed;
};

export const getSafeDescription = (system: any) => {
    if (!system) return '';
    // 1. Try explicit .value property (common for rich text objects)
    if (system.description?.value) return system.description.value;
    // 2. Try description as a direct string
    else if (typeof system.description === 'string' && system.description.trim()) return system.description;
    // 3. Try legacy .desc property
    else if (system.desc) return system.desc;
    return '';
};

export const formatDescription = (desc: any) => {
    // Note: getSafeDescription usually ensures this is a string, but we double check.
    if (!desc || typeof desc !== 'string') return '';

    let fixed = desc;

    // 1. UUID Links: @UUID[...]{Label} -> Label
    fixed = fixed.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1');

    // 2. Inline Rolls: [[/r 1d8]] or [[/roll 1d8]]
    fixed = fixed.replace(/\[\[(.*?)\]\]/g, (match, content) => {
        const cleanContent = content.replace(/<[^>]*>?/gm, '').replace(/&amp;/g, '&').replace(/<[^>]*>/g, '');
        const lower = cleanContent.toLowerCase().trim();

        const checkMatch = lower.match(/^check\s+(\d+)\s+(\w+)$/);
        if (checkMatch) {
            return `<button data-action="roll-check" data-dc="${checkMatch[1]}" data-stat="${checkMatch[2]}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer">check ${checkMatch[2].toUpperCase()} (DC ${checkMatch[1]})</button>`;
        }

        // Only match /r or /roll
        if (lower.startsWith('/r') || lower.startsWith('/roll')) {
            const formula = cleanContent.replace(/^\/(r|roll)\s*/i, '').trim();
            return `<button type="button" data-action="roll-formula" data-formula="${formula}" class="inline-flex items-center gap-1 border border-black bg-white hover:bg-black hover:text-white px-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors mx-1 cursor-pointer"><span class="font-serif italic">roll</span> ${formula}</button>`;
        }

        return match;
    });

    return fixed;
};

/**
 * Resolves a potentially UUID-based field (like class, ancestry, background) to a human-readable name.
 * 
 * @param value - The value stored in the system field (could be Name, ID, or UUID)
 * @param actor - The actor instance containing items
 * @param systemData - The system data containing compendium indexes (classes, ancestries, etc.)
 * @param collectionName - The key in systemData to search (e.g., 'classes', 'ancestries')
 * @returns {string} - The resolved name or the original value if not found
 */
export const resolveEntityName = (value: string, actor: any, systemData: any, collectionName: string): string => {
    if (!value) return '';

    // 1. Try to find an embedded Item on the actor matching ID or UUID
    const embeddedItem = actor.items?.find((i: any) =>
        i.id === value ||
        i.uuid === value ||
        (typeof value === 'string' && value.endsWith(i.id))
    );
    if (embeddedItem) return embeddedItem.name;

    // 2. Try to find it in the System Data (Compendium Index)
    if (systemData && systemData[collectionName]) {
        const sysObj = systemData[collectionName].find((c: any) => c.uuid === value || c.name === value);
        if (sysObj) return sysObj.name;
    }

    // 3. Fallback: Return the value itself (it might already be the name)
    // But if it looks like a Source ID or UUID, we might want to clean it?
    // For now, return as-is to avoid data loss in UI, but hopefully 1 & 2 catch it.
    return value;
};
