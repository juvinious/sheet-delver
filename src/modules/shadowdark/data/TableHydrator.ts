import { logger } from '../../../core/logger';

/**
 * Service to handle the complex assembly and hydration of Shadowdark RollTables
 * from fragmented JSON results.
 */
export class TableHydrator {
    /**
     * Hydrates roll tables with their synthetic or external results.
     */
    static hydrateTables(index: Map<string, any>, resultsMap: Map<string, any[]>): number {
        let hydratedCount = 0;

        for (const [uuid, doc] of index.entries()) {
            if (doc.documentType === 'RollTable' && doc._id) {
                const hydratedResults = resultsMap.get(doc._id);
                
                if (hydratedResults && hydratedResults.length > 0) {
                    logger.debug(`[TableHydrator] Table ${doc.name} hydrated with ${hydratedResults.length} items`);
                    doc.results = hydratedResults.sort((a, b) => (a.range?.[0] || 0) - (b.range?.[0] || 0));
                    hydratedCount++;
                } else if (doc.results && Array.isArray(doc.results) && typeof doc.results[0] === 'string') {
                    // Synthetic Hydration Fallback
                    const syntheticResults: any[] = [];
                    logger.debug(`[TableHydrator] Attempting synthetic hydration for table ${doc.name}`);
                    
                    doc.results.forEach((id: string, indexPos: number) => {
                        let resultDoc = index.get(id);

                        if (!resultDoc && doc.pack) {
                            resultDoc = index.get(`Compendium.shadowdark.${doc.pack}.${id}`);
                        }

                        if (resultDoc) {
                            if (resultDoc.range) {
                                syntheticResults.push(resultDoc);
                            } else if (resultDoc.documentType === 'RollTable') {
                                syntheticResults.push({
                                    _id: id,
                                    type: 2,
                                    documentCollection: 'RollTable',
                                    documentId: resultDoc._id,
                                    text: resultDoc.name,
                                    img: resultDoc.img,
                                    range: [indexPos + 1, indexPos + 1],
                                    weight: 1,
                                    drawn: false
                                });
                            } else {
                                syntheticResults.push({
                                    _id: id,
                                    type: 'document',
                                    documentUuid: resultDoc.uuid || `Compendium.shadowdark.${doc.pack}.Item.${id}`,
                                    name: resultDoc.name,
                                    range: [indexPos + 1, indexPos + 1],
                                    weight: 1
                                });
                            }
                        }
                    });

                    if (syntheticResults.length > 0) {
                        doc.results = syntheticResults;
                        hydratedCount++;
                    }
                }
            }
        }

        return hydratedCount;
    }
}
