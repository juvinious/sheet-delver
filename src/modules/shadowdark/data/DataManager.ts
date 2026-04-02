import { logger } from '../../../core/logger';
import { ShadowdarkCache } from '../caching';

/**
 * DataManager acts as a caching registry for Shadowdark system documents.
 * It has been refactored to fetch data strictly from the Foundry VTT socket,
 * eliminating all local filesystem dependencies.
 */
export class DataManager {
    private static instance: DataManager;
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
        this.initialized = true;
        logger.info('[DataManager] Shadowdark Data Registry initialized (Socket-only mode).');
    }

    /**
     * Get a document by its UUID, fetching from Foundry if not cached.
     */
    public async getDocument(uuid: string, client?: any): Promise<any | null> {
        if (!uuid) return null;
        
        // 1. Check Module Cache first
        const cache = ShadowdarkCache.getInstance();
        const systemData = cache.systemData;
        
        if (systemData) {
            // Search through the discovered collections
            const collections = ['ancestries', 'classes', 'backgrounds', 'deities', 'patrons', 'languages', 'spells', 'talents', 'items', 'tables'];
            for (const key of collections) {
                const doc = systemData[key]?.find((d: any) => d.uuid === uuid || d._id === uuid || d.id === uuid);
                if (doc) return doc;
            }
        }

        // 2. Fetch from Foundry if client is provided
        if (client) {
            try {
                const doc = await client.fetchByUuid(uuid);
                return doc;
            } catch (e) {
                logger.warn(`[DataManager] Failed to fetch document ${uuid} from Foundry:`, e);
            }
        }

        return null;
    }

    /**
     * Look up a document by its name and optionally its type within the discovered system data.
     */
    public findDocumentByName(name: string, type?: string): any | null {
        const cache = ShadowdarkCache.getInstance();
        const systemData = cache.systemData;
        if (!systemData) return null;

        const normalized = name.toLowerCase();
        const collections = ['ancestries', 'classes', 'backgrounds', 'deities', 'patrons', 'languages', 'spells', 'talents', 'items', 'tables'];
        
        for (const key of collections) {
            const found = systemData[key]?.find((doc: any) => {
                if (doc.name?.toLowerCase() !== normalized) return false;
                if (!type) return true;
                const docType = (doc.type || doc.documentType || "").toLowerCase();
                return docType === type.toLowerCase();
            });
            if (found) return found;
        }
        
        return null;
    }

    /**
     * Performs a roll on a RollTable. Fetches the table from Foundry if needed.
     */
    async draw(uuidOrName: string, client: any, rollOverride?: number): Promise<{ id: string, roll: number, total: number, formula: string, results: any[], items: any[], table: any } | null> {
        let table = await this.getDocument(uuidOrName, client);

        if (!table && !uuidOrName.includes('.')) {
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

        // Use formula from table or default to 1d20
        const formula = table.system?.formula || "1d20";
        let roll = rollOverride;
        
        if (roll === undefined) {
            // Simple simulate for common SD formulas (1d20, 2d6, etc)
            const match = formula.match(/^(\d+)d(\d+)$/i);
            if (match) {
                const count = parseInt(match[1]);
                const die = parseInt(match[2]);
                roll = 0;
                for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * die) + 1;
            } else {
                roll = Math.floor(Math.random() * 20) + 1;
            }
        }

        const matched = table.results.filter((r: any) => {
            const range = r.range || [1, 1];
            return roll! >= range[0] && roll! <= range[1];
        });

        const hydratedResults = [];
        for (const res of matched) {
            if (res.documentCollection && res.documentId) {
                const uuid = `Compendium.${res.documentCollection}.${res.documentId}`;
                const itemDoc = await this.getDocument(uuid, client);
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
            roll: roll!,
            total: roll!,
            formula,
            results: hydratedResults,
            items: hydratedResults.map(r => r.document || r).filter(Boolean),
            table: table
        };
    }

    /**
     * Filters discovered spells by class source.
     */
    public async getSpellsBySource(className: string): Promise<any[]> {
        const cache = ShadowdarkCache.getInstance();
        const systemData = cache.systemData;
        if (!systemData || !systemData.spells) return [];

        const normalizedClass = className.toLowerCase();
        
        return systemData.spells.filter((spell: any) => {
            if (!spell.system?.class) return false;
            const classes = Array.isArray(spell.system.class) ? spell.system.class : [spell.system.class];
            
            return classes.some((c: string) => {
                const cLower = String(c).toLowerCase();
                // 1. Direct name match
                if (cLower === normalizedClass) return true;
                // 2. UUID match (heuristic)
                if (cLower.includes(`.${normalizedClass}.`) || cLower.includes(`/${normalizedClass}`)) return true;
                
                // 3. Resolve UUID if possible (from discovered classes)
                const resolvedClass = systemData.classes?.find((cls: any) => (cls.uuid === c || cls._id === c || cls.id === c));
                if (resolvedClass && resolvedClass.name?.toLowerCase() === normalizedClass) return true;

                return false; 
            });
        });
    }

    public async getAllDocuments(): Promise<any[]> {
        const cache = ShadowdarkCache.getInstance();
        const systemData = cache.systemData;
        if (!systemData) return [];
        
        return [
            ...(systemData.ancestries || []),
            ...(systemData.classes || []),
            ...(systemData.backgrounds || []),
            ...(systemData.deities || []),
            ...(systemData.patrons || []),
            ...(systemData.languages || []),
            ...(systemData.spells || []),
            ...(systemData.talents || []),
            ...(systemData.items || []),
            ...(systemData.tables || [])
        ];
    }

    public async getIndex(): Promise<Record<string, string>> {
        const docs = await this.getAllDocuments();
        const result: Record<string, string> = {};
        for (const doc of docs) {
            const uuid = doc.uuid || doc._id || doc.id;
            if (uuid) result[uuid] = doc.name;
        }
        return result;
    }
}

export const dataManager = DataManager.getInstance();
