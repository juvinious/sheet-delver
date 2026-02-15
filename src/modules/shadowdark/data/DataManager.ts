import { logger } from '../../../core/logger';


export class DataManager {
    private static instance: DataManager;
    public index: Map<string, any> = new Map();
    private initialized = false;

    private constructor() { }

    public static getInstance(): DataManager {
        if (!DataManager.instance) {
            DataManager.instance = new DataManager();
        }
        return DataManager.instance;
    }

    public async initialize() {
        if (this.initialized) return;
        if (typeof window !== 'undefined') {
            this.initialized = true; // Mark as "done" but empty in browser
            return;
        }

        let path: any;
        let fs: any;
        try {
            path = (await import('node:path')).default;
            fs = (await import('node:fs')).default;
        } catch (e) {
            logger.error('[DataManager] Failed to load Node.js modules:', e);
            return;
        }

        const packsDir = path.join(process.cwd(), 'src/modules/shadowdark/data/packs');

        if (!fs.existsSync(packsDir)) {
            logger.warn(`[DataManager] Packs directory not found: ${packsDir}`);
            return;
        }

        const resultsMap: Map<string, any[]> = new Map();

        const scanDirectory = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (file.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const data = JSON.parse(content);

                        // Handle embedded documents (files starting with '!' or having certain _key patterns)
                        const internalKey = data._key || '';
                        const parentDir = path.basename(dir);
                        const packName = parentDir.replace('.db', '');
                        const system = 'shadowdark';

                        if (file.startsWith('!') || internalKey.startsWith('!')) {
                            // Example: !tables.results!RQ0vogfVtJGuT9oT.TlVUTCMj9MkYslL5.json
                            // Example: !tables!yVogBTQYwjpWB7YI.json

                            if ((file.startsWith('!tables.results!') || internalKey.startsWith('!tables.results!')) && data._id) {
                                // Extract table ID from filename or key
                                const keyToMatch = file.startsWith('!tables.results!') ? file : internalKey;
                                const match = keyToMatch.match(/!tables\.results!([^.]+)\.([^.]+)/);

                                if (match) {
                                    const tableId = match[1];
                                    const resultId = match[2];

                                    // Index by result ID
                                    this.index.set(resultId, data);

                                    // Also index by full embedded UUID format
                                    const embeddedUuid = `Compendium.${system}.${packName}.${tableId}.TableResult.${resultId}`;
                                    this.index.set(embeddedUuid, data);

                                    // Collect for hydration
                                    if (!resultsMap.has(tableId)) resultsMap.set(tableId, []);
                                    resultsMap.get(tableId)?.push(data);

                                    continue; // Skip regular indexing
                                }
                            } else if ((file.startsWith('!tables!') || internalKey.startsWith('!tables!')) && data._id) {
                                // This is an actual RollTable document
                                const docType = 'RollTable';
                                const uuidShort = `Compendium.${system}.${packName}.${data._id}`;
                                const uuidLong = `Compendium.${system}.${packName}.${docType}.${data._id}`;

                                data.pack = packName;
                                data.uuid = uuidLong;
                                data.documentType = docType;

                                this.index.set(uuidShort, data);
                                this.index.set(uuidLong, data);

                                continue; // Skip regular indexing
                            }
                        }

                        // Regular Indexing
                        if (data._id) {
                            let docType = data.type === 'Actor' ? 'Actor' : 'Item';
                            if (packName === 'rollable-tables') docType = 'RollTable';

                            // If we missed a RollTable because of missing prefix/key (unlikely but safe)
                            if (docType === 'RollTable' && data.results) {
                                // Already handled in the hydration loop later
                            }

                            const uuidShort = `Compendium.${system}.${packName}.${data._id}`;
                            const uuidLong = `Compendium.${system}.${packName}.${docType}.${data._id}`;

                            data.pack = packName;
                            data.uuid = uuidLong;
                            data.documentType = docType;

                            this.index.set(uuidShort, data);
                            this.index.set(uuidLong, data);
                        }

                    } catch (e) {
                        logger.error(`[DataManager] Failed to parse ${file}`, e);
                    }
                }
            }
        };

        logger.time('[DataManager] Indexing');
        scanDirectory(packsDir);

        // Hydrate tables with their results
        let hydratedCount = 0;
        for (const [uuid, doc] of this.index.entries()) {
            if (doc.documentType === 'RollTable' && doc._id) {
                const hydratedResults = resultsMap.get(doc._id);
                if (hydratedResults && hydratedResults.length > 0) {
                    logger.debug(`[DataManager] Table ${doc.name} hydrated via resultsMap with ${hydratedResults.length} items`);
                    // Sort by range start to be safe
                    doc.results = hydratedResults.sort((a, b) => (a.range?.[0] || 0) - (b.range?.[0] || 0));
                    hydratedCount++;
                } else if (doc.results && Array.isArray(doc.results) && typeof doc.results[0] === 'string') {
                    // FALLBACK: Synthetic Hydration for tables with string IDs but no external result docs found
                    // Search for those IDs in the index
                    const syntheticResults: any[] = [];
                    logger.debug(`[DataManager] Attempting synthetic hydration for table ${doc.name} (${doc.results.length} IDs)`);
                    doc.results.forEach((id: string, index: number) => {
                        let resultDoc = this.index.get(id);

                        // Try resolving as UUID if simple ID lookup fails
                        if (!resultDoc && doc.pack) {
                            resultDoc = this.index.get(`Compendium.shadowdark.${doc.pack}.${id}`);
                        }

                        if (resultDoc) {
                            // If it's already a TableResult (has range), use it
                            if (resultDoc.range) {
                                syntheticResults.push(resultDoc);
                            } else if (resultDoc.documentType === 'RollTable') {
                                // Don't hydrate nested tables, just link them
                                syntheticResults.push({
                                    _id: id,
                                    type: 2, // document
                                    documentCollection: 'RollTable',
                                    documentId: resultDoc._id,
                                    text: resultDoc.name,
                                    img: resultDoc.img,
                                    range: [index + 1, index + 1],
                                    weight: 1,
                                    drawn: false
                                });
                            } else {
                                // Create a synthetic TableResult wrapper
                                syntheticResults.push({
                                    _id: id,
                                    type: 'document',
                                    documentUuid: resultDoc.uuid || `Compendium.shadowdark.${doc.pack}.Item.${id}`,
                                    name: resultDoc.name,
                                    range: [index + 1, index + 1],
                                    weight: 1
                                });
                            }
                        } else {
                            logger.warn(`[DataManager] Failed to resolve result ID ${id} for table ${doc.name}`);
                        }
                    });

                    if (syntheticResults.length > 0) {
                        doc.results = syntheticResults;
                        hydratedCount++;
                    }
                }
            }
        }
        if (hydratedCount > 0) {
            logger.info(`DataManager | Hydrated ${hydratedCount} RollTables with results.`);
        }
        logger.timeEnd('[DataManager] Indexing');
        logger.debug(`[DataManager] Indexed ${this.index.size} entries.`);
        this.initialized = true;
    }

    public async getDocument(uuid: string): Promise<any | null> {
        // If not initialized yet, do it lazily
        if (!this.initialized) await this.initialize();

        return this.index.get(uuid) || null;
    }

    /**
     * Look up a document by its name and optionally its type.
     * This is useful when a UUID is not available.
     * 
     * @param name - The name of the document to find
     * @param type - The document type (e.g. 'RollTable', 'Item')
     * @returns The document object or null if not found
     */
    public findDocumentByName(name: string, type?: string): any | null {
        const normalized = name.toLowerCase();
        for (const doc of this.index.values()) {
            if (doc.name?.toLowerCase() === normalized) {
                if (!type || doc.type === type || doc.documentCollection === type || doc.documentType === type) {
                    return doc;
                }
            }
        }
        return null;
    }

    async draw(uuidOrName: string, rollOverride?: number): Promise<{ id: string, roll: number, total: number, formula: string, results: any[], items: any[], table: any } | null> {
        let table = await this.getDocument(uuidOrName);

        if (!table) {
            table = this.findDocumentByName(uuidOrName, 'RollTable');
        }

        if (!table) {
            logger.warn(`[DataManager] Draw failed: Could not find table '${uuidOrName}'`);
            return null;
        }

        if (!table.results || !Array.isArray(table.results)) {
            logger.warn(`[DataManager] Draw failed: Table '${table.name}' has no results.`);
            return null;
        }

        // Use Math.random 2-12 unless overridden
        const roll = rollOverride ?? (Math.floor(Math.random() * (12 - 2 + 1)) + 2);

        const matched = table.results.filter((r: any) => {
            const range = r.range || [1, 1];
            return roll >= range[0] && roll <= range[1];
        });

        // Hydrate results with raw data if they are just IDs or partially hydrated
        const hydratedResults = [];
        for (const res of matched) {
            // results are already mostly hydrated in initialize()'s resultsMap logic,
            // but let's ensure we have the full document if it's a link.
            if (res.documentCollection && res.documentId) {
                const collection = res.documentCollection.includes('.') ? res.documentCollection : `shadowdark.${res.documentCollection}`;
                const uuid = `Compendium.${collection}.${res.documentId}`;
                const itemDoc = await this.getDocument(uuid);
                if (itemDoc) {
                    hydratedResults.push({ ...res, document: itemDoc });
                } else {
                    hydratedResults.push(res);
                }
            } else {
                hydratedResults.push(res);
            }
        }

        return {
            id: table._id || table.id,
            roll: roll,         // User requested field
            total: roll,        // Engine compatibility
            formula: table.system?.formula || "2d6",
            results: hydratedResults,
            items: hydratedResults.map(r => r.document || r).filter(Boolean),
            table: table
        };
    }


    public async getSpellsBySource(className: string): Promise<any[]> {
        if (!this.initialized) await this.initialize();

        // const spells: any[] = [];
        const normalizedClass = className.toLowerCase();


        const uniqueDocs = new Set(this.index.values());

        for (const doc of uniqueDocs) {
            if (doc.type !== 'Spell') continue;

            // Check sources
            // System specific: doc.system.class is an array of Class UUIDs OR names?
            // "system": { "class": [ "Compendium.shadowdark.classes.Item.035nuVkU9q2wtMPs" ] }
            // So we need to match the UUID of the class name provided.

            // This implies we need to know the UUID of "Wizard" to find spells for "Wizard".
            // Implementation: Find Class UUID by Name first.
        }

        // Find Class UUID
        // let classUuid: string | null = null;
        for (const doc of uniqueDocs) {
            if (doc.type === 'Class' && doc.name.toLowerCase() === normalizedClass) {
                // heuristic: find the one that looks like a compendium item?
                // actually we have the UUIDs in the map keys.
                // But efficient reverse lookup is tricky.
                // Let's just find the document matching the name.
                // let classUuid = doc._id;
                // The .json usually has _id: "16XuBF2xjUnoepyp"
                // The spell has system.class: ["Compendium.shadowdark.classes.Item.035nuVkU9q2wtMPs"]
                // We need to match that.
                break;
            }
        }

        // If we can't find the class by name in our data, we can't filter safely?
        // Actually, we can return all spells and filter if we know the UUID.

        // Resolve all promises concurrently for efficiency if getDocument call was needed (but we have index)
        // Actually we don't need getDocument if we iterate internal index.
        // But the filter lambda uses it.

        const results: any[] = [];
        for (const doc of Array.from(uniqueDocs)) {
            if (doc.type !== 'Spell') continue;
            if (!doc.system?.class) continue;

            let match = false;
            // Iterate classes safely
            const classes = Array.isArray(doc.system.class) ? doc.system.class : [doc.system.class];

            for (const classRef of classes) {
                // We need to look up the classRef in our index
                // We can access this.index directly since we are in the class.
                const linkedClass = this.index.get(classRef);
                if (linkedClass && linkedClass.name.toLowerCase() === normalizedClass) {
                    match = true;
                    break;
                }
            }
            if (match) results.push(doc);
        }
        return results;
    }

    public async getAllDocuments(): Promise<any[]> {
        if (!this.initialized) await this.initialize();
        return Array.from(new Set(this.index.values()));
    }

    public async getIndex(): Promise<Record<string, string>> {
        if (!this.initialized) await this.initialize();
        const result: Record<string, string> = {};
        for (const [_uuid, doc] of this.index.entries()) {
            result[_uuid] = doc.name;
        }
        return result;
    }

    /**
     * Simple dice formula parser (e.g., "2d6", "1d20+2", etc.)
     */
    private _rollFormula(formula: string): number {
        try {
            // Trim and normalize
            const f = formula.toLowerCase().replace(/\s+/g, '');

            // Match standard [count]d[die][+|-][mod]
            const match = f.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/);
            if (!match) {
                // If it's just a number, return it
                const n = parseInt(f);
                return isNaN(n) ? 0 : n;
            }

            const count = parseInt(match[1]);
            const die = parseInt(match[2]);
            const op = match[3];
            const mod = match[4] ? parseInt(match[4]) : 0;

            let total = 0;
            for (let i = 0; i < count; i++) {
                total += Math.floor(Math.random() * die) + 1;
            }

            if (op === '+') total += mod;
            if (op === '-') total -= mod;

            return total;
        } catch (e) {
            logger.error(`[DataManager] Error rolling formula "${formula}":`, e);
            return 0;
        }
    }
}

export const dataManager = DataManager.getInstance();
