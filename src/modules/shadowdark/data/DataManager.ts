import { logger } from '@/core/logger';


class DataManager {
    private static instance: DataManager;
    private index: Map<string, any> = new Map();
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

        const path = (await import('path')).default;
        const fs = (await import('fs')).default;

        const packsDir = path.join(process.cwd(), 'src/modules/shadowdark/data/packs');

        if (!fs.existsSync(packsDir)) {
            console.warn(`[DataManager] Packs directory not found: ${packsDir}`);
            return;
        }

        const scanDirectory = (dir: string) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (file.endsWith('.json') && !file.startsWith('!')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const data = JSON.parse(content);

                        // Index by UUID if available
                        // Foundry exports usually have _id. The Full UUID is Compendium.<pack>.<type>.<id>
                        // But here we might just have the raw exported object.
                        // Let's see how our lookups are formed. 
                        // Usually: Compendium.shadowdark.spells.Item.123456

                        // We will try to construct the UUID from the file path or content?
                        // The file system structure is `.../packs/spells.db/item.json`
                        // So pack = `spells` (from spells.db)
                        // Type is usually Item or Actor.
                        // ID is data._id

                        // Let's deduce pack name from parent directory
                        const parentDir = path.basename(dir);
                        // e.g. "spells.db" -> "spells"
                        const packName = parentDir.replace('.db', '');

                        if (data._id) {
                            // Construct canonical UUID
                            // Note: Foundry UUIDs can be tricky. "Compendium.shadowdark.spells.12345" or "Compendium.shadowdark.spells.Item.12345"
                            // If we look at `talent-effects.ts`, it uses: 'Compendium.shadowdark.talents.IDGFaxKnYJWWuWQ7'
                            // It seems to omit the Type? Or depends on how it was referenced.
                            // Let's support both formats to be safe: 
                            // 1. Compendium.shadowdark.<pack>.<id>
                            // 2. Compendium.shadowdark.<pack>.Item.<id> (if it's an item)

                            const system = 'shadowdark';
                            const docType = data.type === 'Actor' ? 'Actor' : 'Item';

                            const uuidShort = `Compendium.${system}.${packName}.${data._id}`;
                            const uuidLong = `Compendium.${system}.${packName}.${docType}.${data._id}`;

                            // Attach metadata to the document itself for easier traversal
                            data.pack = packName;
                            data.uuid = uuidLong;

                            this.index.set(uuidShort, data);
                            this.index.set(uuidLong, data);

                            // specific for our usage: if `data.uuid` is present (ex: from an export), use it too?
                        }

                    } catch (e) {
                        console.error(`[DataManager] Failed to parse ${file}`, e);
                    }
                }
            }
        };

        logger.time('[DataManager] Indexing');
        scanDirectory(packsDir);
        logger.timeEnd('[DataManager] Indexing');
        logger.debug(`[DataManager] Indexed ${this.index.size} entries.`);
        this.initialized = true;
    }

    public async getDocument(uuid: string): Promise<any | null> {
        // If not initialized yet, do it lazily
        if (!this.initialized) await this.initialize();

        return this.index.get(uuid) || null;
    }

    public async getSpellsBySource(className: string): Promise<any[]> {
        if (!this.initialized) await this.initialize();

        // const spells: any[] = [];
        const normalizedClass = className.toLowerCase();

        for (const [_key, _doc] of this.index.entries()) {
            // Unpack if duplicated (we store short and long UUIDs)
            // Just iterate unique objects? The map values are references, so strict equality works, 
            // but we iterate entries.
            // Let's iterate values uniquely.
        }

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
        for (const [uuid, doc] of this.index.entries()) {
            result[uuid] = doc.name;
        }
        return result;
    }
}

export const dataManager = DataManager.getInstance();
