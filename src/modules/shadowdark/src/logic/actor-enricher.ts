import { TALENT_HANDLERS } from '../logic/talent-handlers';
import { SYSTEM_PREDEFINED_EFFECTS } from '../data/talent-effects';
import { createEffect, sanitizeItem } from '../utils/Sanitizer';
import { logger } from '@shared/utils/logger';

export interface EnrichmentContext {
    addedSourceIds: Set<string>;
    addedNames: Set<string>;
    targetLevel: number;
    actor: any;
    bonusTo?: string; // Optional for Resolve "REPLACEME"
    bonuses?: any[]; // Shadowdarkling bonuses array
    mapping?: any;   // mapping object
    patronName?: string; // If applicable (Warlock)
    discoveredItems?: any[]; // Collects items linked via @UUID
    resolveDoc?: (uuid: string) => Promise<any>; // Function to resolve documents for linked items
    defaultTalentClass?: 'ancestry' | 'class' | 'level'; // Hint for talent categorization
}

/**
 * Standardized item enrichment for Shadowdark characters.
 * Identical logic shared between Generator (Client) and Importer (Server).
 */
export async function enrichItem(item: any, context: EnrichmentContext): Promise<any | null> {
    if (!item) return null;
    
    // 1. DEEP CLONE: Prevent cache poisoning of shared shard data or server cache
    const enriched = JSON.parse(JSON.stringify(item));
    
    const sourceId = enriched.uuid || enriched.flags?.core?.sourceId || enriched._id;
    const itemName = enriched.name || "Unnamed";

    // Standardize type ONLY if missing
    if (!enriched.type || enriched.type === "Unknown") {
        enriched.type = "Talent";
    }

    // 2. Prevent Duplicates
    const typeNameKey = `${enriched.type}:${itemName}`;
    if (sourceId && context.addedSourceIds.has(sourceId)) return null;
    if (context.addedNames.has(typeNameKey)) return null;
    
    // 3. Ensure ID exists
    if (!enriched._id && !enriched.id) {
        enriched._id = Math.random().toString(36).substring(2, 15);
    }

    // 4. Trace context if applicable (Minimal)
    if (context.patronName && enriched.type === "Talent" && !enriched.name.includes(`[${context.patronName}]`)) {
        enriched.name += ` [${context.patronName}]`;
    }

    // 5. Discovery only - DO NOT mutate with handlers or predef for cached docs
    // We only resolve linked items (@UUID)
    if (context.resolveDoc && context.discoveredItems) {
        await resolveLinkedItems(enriched, context.resolveDoc, context);
    }

    // 6. Apply Talent Metadata Hinting
    if (enriched.type === "Talent" && !enriched.system?.talentClass && context.defaultTalentClass) {
        if (!enriched.system) enriched.system = {};
        enriched.system.talentClass = context.defaultTalentClass;
        logger.debug(`[ActorEnricher] Applied talentClass hint '${context.defaultTalentClass}' to ${enriched.name}`);
    }

    if (sourceId) context.addedSourceIds.add(sourceId);
    context.addedNames.add(`${enriched.type}:${enriched.name}`);
    
    return enriched;
}

/**
 * Scans an item's description for @UUID[Compendium.shadowdark.*] links and resolves them.
 * This ensures that talents that grant abilities (like Demonic Possession) import correctly.
 */
export async function resolveLinkedItems(
    item: any,
    resolveDocFn: (uuid: string) => Promise<any>,
    context: EnrichmentContext
): Promise<void> {
    const rawDesc = item.system?.description?.value || item.system?.description || "";
    const description = typeof rawDesc === 'string' ? rawDesc : "";
    
    logger.debug(`[ActorEnricher] SCAN description for '${item.name}' (Type: ${typeof rawDesc}, Length: ${description.length})`);
    
    if (description.length === 0) {
        return;
    }

    // Matches @UUID[Compendium.shadowdark.collection.Item.ID] or @UUID[Compendium.shadowdark.collection.ID]
    // Loosened to match any shadowdark compendium reference
    const uuidPattern = /@UUID\[(Compendium\.shadowdark\.[^\]]+)\]/g;
    let match;

    const hasAnyMatch = /@UUID\[Compendium\.shadowdark/.test(description);
    logger.info(`[ActorEnricher] Regex quick-test for '${item.name}': ${hasAnyMatch ? 'MATCHED' : 'NONE'}`);

    while ((match = uuidPattern.exec(description)) !== null) {
        const uuid = match[1];
        
        // Skip if already added to avoid infinite loops or duplicates
        if (context.addedSourceIds && context.addedSourceIds.has(uuid)) {
            logger.debug(`[ActorEnricher] Skipping already processed UUID: ${uuid}`);
            continue;
        }
        
        try {
            logger.info(`[ActorEnricher] Found linked UUID ${uuid} in item '${item.name}'`);
            const linkedDoc = await resolveDocFn(uuid);
            
            if (linkedDoc) {
                logger.debug(`[ActorEnricher] Successfully fetched linked doc: ${linkedDoc.name} (${linkedDoc.type})`);
                // Enrich the linked item (without recursion to avoid depth issues, as per user request)
                // We create a shallow context for the linked item to prevent recursive scanning
                const shallowContext: EnrichmentContext = {
                    ...context,
                    discoveredItems: undefined, // Disable further discovery for this specific resolution
                    resolveDoc: undefined      // Disable further resolution
                };
                
                const enrichedLinked = await enrichItem(linkedDoc, shallowContext);
                if (enrichedLinked && context.discoveredItems) {
                    logger.info(`[ActorEnricher] -> Discovered additional ability '${enrichedLinked.name}' via ${item.name}`);
                    context.discoveredItems.push(enrichedLinked);
                }
            } else {
                logger.warn(`[ActorEnricher] Could not resolve linked UUID ${uuid} found in ${item.name}`);
            }
        } catch (e) {
            logger.error(`[ActorEnricher] Failed to resolve linked item ${uuid}:`, e);
        }
    }
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

    const isAncestry = parentItem.type === "Ancestry";

    const talentRefs = parentItem.system.talents || [];
    const featureRefs = parentItem.system.features || [];
    const abilityRefs = parentItem.system.abilities || [];
    const classAbilities = parentItem.system.classAbilities || [];
    const startingSpells = parentItem.system.startingSpells || [];

    // Aggregate references strictly from the compendium document
    let allRefs = [
        ...talentRefs, 
        ...featureRefs, 
        ...abilityRefs, 
        ...classAbilities, 
        ...startingSpells
    ];

    logger.debug(`[ActorEnricher] Resolving ${allRefs.length} sub-items for ${parentItem.name} (${parentItem.type})...`);

    const resolvePromises = allRefs.map(async (ref) => {
        const uuid = (typeof ref === 'string') ? ref : (ref.uuid || ref._id || ref.id);
        if (!uuid) return null;

        try {
            const doc = await resolveDocFn(uuid);
            if (doc) {
                let include = true;

                // IF Parent is Ancestry: Resolve ONLY if Fixed
                if (isAncestry && talentRefs.includes(uuid)) {
                    const count = parentItem.system.talentChoiceCount || 0;
                    const total = talentRefs.length || 0;
                    // It's a choice IF total > count. Items in choice pools should not be 'fixed'.
                    if (total > count) {
                        include = false;
                        logger.debug(`[ActorEnricher] Skipping ancestry choice item: ${doc.name}`);
                    }
                }

                if (include) {
                    // Create a sub-context with the appropriate hint
                    const subContext: EnrichmentContext = {
                        ...context,
                        defaultTalentClass: isAncestry ? 'ancestry' : (parentItem.type === 'Class' ? 'class' : context.defaultTalentClass)
                    };
                    return await enrichItem(doc, subContext);
                }
            } else {
                logger.warn(`[ActorEnricher] Could not resolve sub-item: ${uuid}`);
            }
        } catch (e) {
            logger.error(`[ActorEnricher] Error resolving sub-item ${uuid}:`, e);
        }
        return null;
    });

    const results = await Promise.all(resolvePromises);
    for (const enriched of results) {
        if (enriched) items.push(enriched);
    }

    return items;
}
