import tablesData from './packs/morkborg.mork-borg-tables.json';
import itemsData from './packs/morkborg.mork-borg-items.json';

export class MorkBorgDataManager {
    private static instance: MorkBorgDataManager;
    private tablesCache: any[] | null = null;
    private itemsCache: any[] | null = null;

    private constructor() {
        this.loadData();
    }

    public static getInstance(): MorkBorgDataManager {
        if (!MorkBorgDataManager.instance) {
            MorkBorgDataManager.instance = new MorkBorgDataManager();
        }
        return MorkBorgDataManager.instance;
    }

    private loadData() {
        try {
            this.tablesCache = tablesData as any[];
            this.itemsCache = itemsData as any[];
        } catch (error) {
            console.error('Failed to load Mork Borg compendium data:', error);
            this.tablesCache = [];
            this.itemsCache = [];
        }
    }

    public getItemByName(name: string): any {
        if (!this.itemsCache) return null;
        return this.itemsCache.find(i => i.name === name);
    }

    public getItemById(id: string): any {
        if (!this.itemsCache) return null;
        return this.itemsCache.find(i => i._id === id);
    }

    public getItemsByType(types: string[]): any[] {
        if (!this.itemsCache) return [];
        return this.itemsCache.filter(i => types.includes(i.type));
    }

    private resolveTableName(alias: string): string {
        const mappings: Record<string, string> = {
            'uncleanScrolls': 'Unclean Scrolls',
            'sacredScrolls': 'Sacred Scrolls',
            'arcaneCatastrophes': 'Arcane Catastrophes - To Leave Cube-Violet',
            'broken': 'Broken'
        };
        return mappings[alias] || alias;
    }

    public drawFromTable(tableAlias: string): any {
        if (!this.tablesCache) return { name: "Unknown", description: "Data unavailable." };

        const targetName = this.resolveTableName(tableAlias);
        const table = this.tablesCache.find(t => t.name === targetName);

        if (!table || !table.results || table.results.length === 0) {
            return { name: "Unknown", description: "Table not found or empty." };
        }

        // Simulate rolling on the table formula
        const formula = table.formula || "1d10"; // Fallback to a common die
        const formulaMax = parseInt(formula.split('d')[1] || formula, 10) || table.results.length;

        // Random number 1..formulaMax
        const rollResult = Math.floor(Math.random() * formulaMax) + 1;

        // Find the result matching the drawn range
        let drawnEntry = table.results.find((r: any) => rollResult >= r.range[0] && rollResult <= r.range[1]);

        // Fallback to highest entry if we somehow exceeded range
        if (!drawnEntry) {
            drawnEntry = table.results[table.results.length - 1];
        }

        // It might be a document reference (weapon/item) or pure text
        if (drawnEntry.type === "document") {
            // Look it up locally so we get full data
            const internalItem = this.getItemByName(drawnEntry.name);
            if (internalItem) {
                return { ...internalItem, isDocument: true };
            }
            return { name: drawnEntry.name, description: "Unknown Document." };
        }

        // Text result
        return {
            name: drawnEntry.name || drawnEntry.description || "Unknown",
            description: drawnEntry.name ? drawnEntry.description : ""
        };
    }
}

export const mbDataManager = MorkBorgDataManager.getInstance();
