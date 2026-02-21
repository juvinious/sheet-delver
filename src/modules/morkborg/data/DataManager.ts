import { MorkBorgTables } from './MorkBorgTables';

export class MorkBorgDataManager {
    private static instance: MorkBorgDataManager;

    private constructor() { }

    public static getInstance(): MorkBorgDataManager {
        if (!MorkBorgDataManager.instance) {
            MorkBorgDataManager.instance = new MorkBorgDataManager();
        }
        return MorkBorgDataManager.instance;
    }

    public drawFromTable(tableName: string): any {
        const table = (MorkBorgTables as any)[tableName];
        if (!table || table.length === 0) {
            return { name: "Unknown", description: "No data available." };
        }

        const randomIndex = Math.floor(Math.random() * table.length);
        const entry = table[randomIndex];

        if (typeof entry === 'string') {
            return { name: entry, description: "" };
        }

        return entry;
    }

    public getTableSize(tableName: string): number {
        const table = (MorkBorgTables as any)[tableName];
        return table ? table.length : 0;
    }
}

export const mbDataManager = MorkBorgDataManager.getInstance();
