
import path from 'path';
import fs from 'fs';

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

    public initialize() {
        if (this.initialized) return;

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
                } else if (file.endsWith('.json')) {
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
                            const docType = data.type === 'Actor' ? 'Actor' : 'Item'; // rudimentary type check

                            const uuidShort = `Compendium.${system}.${packName}.${data._id}`;
                            const uuidLong = `Compendium.${system}.${packName}.${docType}.${data._id}`;

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

        console.time('[DataManager] Indexing');
        scanDirectory(packsDir);
        console.timeEnd('[DataManager] Indexing');
        console.log(`[DataManager] Indexed ${this.index.size} entries.`);
        this.initialized = true;
    }

    public getDocument(uuid: string): any | null {
        // If not initialized yet, do it lazily
        if (!this.initialized) this.initialize();

        return this.index.get(uuid) || null;
    }

    public getSpellsBySource(className: string): any[] {
        if (!this.initialized) this.initialize();

        const spells: any[] = [];
        const normalizedClass = className.toLowerCase();

        for (const [key, doc] of this.index.entries()) {
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
        let classUuid: string | null = null;
        for (const doc of uniqueDocs) {
            if (doc.type === 'Class' && doc.name.toLowerCase() === normalizedClass) {
                // heuristic: find the one that looks like a compendium item?
                // actually we have the UUIDs in the map keys.
                // But efficient reverse lookup is tricky.
                // Let's just find the document matching the name.
                classUuid = doc._id; // We need the full UUID usually stored in .class array?
                // The .json usually has _id: "16XuBF2xjUnoepyp"
                // The spell has system.class: ["Compendium.shadowdark.classes.Item.035nuVkU9q2wtMPs"]
                // We need to match that.
                break;
            }
        }

        // If we can't find the class by name in our data, we can't filter safely?
        // Actually, we can return all spells and filter if we know the UUID.

        return Array.from(uniqueDocs).filter(doc => {
            if (doc.type !== 'Spell') return false;
            if (!doc.system?.class) return false;

            // Check if any of the associated classes match the requested class name
            // Requires resolving the linked UUIDs to see if they are the class we want.
            // OR finding our class doc first.

            // Alternative: Return all spells, let caller filter? No, inefficient.

            return doc.system.class.some((classRef: string) => {
                const linkedClass = this.getDocument(classRef);
                return linkedClass && linkedClass.name.toLowerCase() === normalizedClass;
            });
        });
    }

    public getAllDocuments(): any[] {
        if (!this.initialized) this.initialize();
        return Array.from(new Set(this.index.values()));
    }
}

export const dataManager = DataManager.getInstance();
