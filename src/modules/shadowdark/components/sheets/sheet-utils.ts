
// Re-export shared logic from lib
import { calculateItemSlots, calculateMaxSlots } from '../../system/rules';
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
