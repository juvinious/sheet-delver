import { TALENT_HANDLERS } from './talent-handlers';
import { SYSTEM_PREDEFINED_EFFECTS } from '../data/talent-effects';
import { createEffect, sanitizeItem } from '../utils/Sanitizer';
import { logger } from '../../../core/logger';

export interface EnrichmentContext {
    addedSourceIds: Set<string>;
    addedNames: Set<string>;
    targetLevel: number;
    actor: any;
    bonusTo?: string; // Optional for Resolve "REPLACEME"
    bonuses?: any[]; // Shadowdarkling bonuses array
    mapping?: any;   // mapping object
    patronName?: string; // If applicable (Warlock)
}

/**
 * Standardized item enrichment for Shadowdark characters.
 * Identical logic shared between Generator (Client) and Importer (Server).
 */
export async function enrichItem(item: any, context: EnrichmentContext): Promise<any | null> {
    if (!item) return null;

    const sourceId = item.uuid || item.flags?.core?.sourceId || item._id;

    // 1. Prevent Duplicates
    if (context.addedSourceIds.has(sourceId)) {
        logger.debug(`[ActorEnricher] Skipping duplicate source: ${sourceId}`);
        return null;
    }
    if (context.addedNames.has(item.name)) {
        logger.debug(`[ActorEnricher] Skipping duplicate by name: ${item.name}`);
        return null;
    }

    // Clone to avoid mutating original discovered indices
    const enriched = JSON.parse(JSON.stringify(item));
    
    // 2. Pre-generate ID if missing (Foundry requirement)
    if (!enriched._id && !enriched.id) {
        enriched._id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // 3. Boon/Talent Labeling & Tagging
    // Restore logic from main: label with patron if applicable
    if (context.patronName && enriched.type === "Talent") {
        if (!enriched.name.includes(`[${context.patronName}]`)) {
            enriched.name += ` [${context.patronName}]`;
        }
    }

    // 3. Apply Talent Handlers (Stat selection, etc.)
    for (const handler of TALENT_HANDLERS) {
        if (handler.matches(enriched)) {
            try {
                if (handler.mutateItem) {
                    handler.mutateItem(enriched, context);
                }
            } catch (e) {
                logger.warn(`[ActorEnricher] Handler ${handler.id} failed for ${enriched.name}`);
            }
        }
    }

    // 5. Apply System Predefined Effects (Automation)
    const predefinedKey = enriched.name.replace(/\s+/g, "");
    let predef = SYSTEM_PREDEFINED_EFFECTS[enriched.name] || SYSTEM_PREDEFINED_EFFECTS[predefinedKey];
    
    // Polyfill: If no direct match by name, try fallback keyword matching 
    // This restores the "Sanitizer" logic from main branch
    if (!predef && enriched.effects?.length === 0) {
        const nameLower = enriched.name.toLowerCase();
        for (const [key, def] of Object.entries(SYSTEM_PREDEFINED_EFFECTS)) {
            const defLabelLower = (def as any).label?.toLowerCase() || key.toLowerCase();
            if (nameLower.includes(defLabelLower) || defLabelLower.includes(nameLower)) {
                predef = def;
                logger.debug(`[ActorEnricher] Polyfilled effect ${key} for ${enriched.name}`);
                break;
            }
        }
    }

    if (predef) {
        enriched.img = predef.icon || enriched.img;
        const changes = predef.changes || (predef.key ? [{ key: predef.key, mode: predef.mode || 2, value: predef.value }] : []);
        
        if (changes.length > 0) {
            // Resolve "REPLACEME" if context provides a target
            const resolvedChanges = changes.map(c => {
                let val = c.value;
                if (typeof val === 'string' && val.includes("REPLACEME")) {
                    val = val.replace("REPLACEME", (context.bonusTo || "").toLowerCase().replace(/\s+/g, "-"));
                }
                return { ...c, value: val };
            });

            // Ensure we don't double-add if it already has this effect ID
            const effect = createEffect(predef.label, predef.icon, resolvedChanges, { 
                sourceName: "Shadowdark Enrichment",
                flags: { shadowdarkling: { name: enriched.name } }
            });
            
            enriched.effects = enriched.effects || [];
            if (!enriched.effects.some((e: any) => e.name === effect.name)) {
                enriched.effects.push(effect);
            }
        }
    }

    // 5. Force Level context if applicable
    if (enriched.system && typeof enriched.system.level !== 'undefined') {
        enriched.system.level = context.targetLevel || 1;
    }

    // 6. Sanitize
    const cleaned = sanitizeItem(enriched);
    
    context.addedSourceIds.add(sourceId);
    context.addedNames.add(cleaned.name);
    
    return cleaned;
}

/**
 * Recursively resolves sub-items (talents, features, abilities) from a parent item (Ancestry, Class).
 */
export async function resolveSubItems(
    parentItem: any, 
    resolveDocFn: (uuid: string) => Promise<any>, 
    context: EnrichmentContext
): Promise<any[]> {
    const items: any[] = [];
    if (!parentItem?.system) return items;

    // Shadowdark System: Class and Ancestry items can have 'talents', 'features', 'abilities'
    // but we must check 'talentChoiceCount' to see if they are FIXED or CHOICES.
    const choiceCount = parentItem.system.talentChoiceCount || 0;
    const rawTalents = parentItem.system.talents || [];
    
    // Logic from main: Only auto-add talents if choiceCount is 0 or all are fixed
    const talentRefs = (choiceCount === 0 || rawTalents.length <= choiceCount) ? rawTalents : [];
    
    const featureRefs = parentItem.system.features || [];
    const abilityRefs = parentItem.system.abilities || [];
    
    const allRefs = [...talentRefs, ...featureRefs, ...abilityRefs];

    logger.debug(`[ActorEnricher] Resolving ${allRefs.length} sub-items for ${parentItem.name}...`);

    for (const ref of allRefs) {
        const uuid = (typeof ref === 'string') ? ref : (ref.uuid || ref._id || ref.id);
        if (!uuid) continue;

        try {
            const doc = await resolveDocFn(uuid);
            if (doc) {
                const enriched = await enrichItem(doc, context);
                if (enriched) items.push(enriched);
            } else {
                logger.warn(`[ActorEnricher] Could not resolve sub-item: ${uuid}`);
            }
        } catch (e) {
            // Graceful failure for dead links/orphaned UUIDs
            logger.error(`[ActorEnricher] Orphaned UUID caught: ${uuid}`);
        }
    }

    return items;
}
