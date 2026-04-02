import { logger } from '../../../core/logger';
import { DataStore } from './DataStore';
import { TableHydrator } from './TableHydrator';

/**
 * DataManager maintains the in-memory index of all system documents 
 * loaded from local JSON packs.
 */
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
        
        // Browser safety: Skip file indexing in client-side context
        if (typeof window !== 'undefined') {
            this.initialized = true;
            return;
        }

        try {
            logger.info('[DataManager] Initializing Shadowdark Data Registry...');
            
            // 1. Scan and Index Packs
            const { index: scanIndex, resultsMap } = DataStore.scanPacks();
            this.index = scanIndex;

            // 2. Hydrate RollTables
            const hydratedCount = TableHydrator.hydrateTables(this.index, resultsMap);
            
            logger.info(`[DataManager] Registry initialized with ${this.index.size} documents, ${hydratedCount} tables hydrated.`);
            this.initialized = true;
        } catch (e) {
            logger.error('[DataManager] Failed to initialize registry:', e);
        }
    }

    /**
     * Get a document from the index by its ID or UUID.
     */
    public async getDocument(query: string): Promise<any | null> {
        if (!this.initialized) await this.initialize();
        return this.index.get(query) || null;
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
