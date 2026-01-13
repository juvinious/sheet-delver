export interface ActorSheetData {
    id: string;
    name: string;
    type: string;
    img: string;
    hp?: { value: number; max: number };
    ac?: number;
    attributes?: Record<string, any>;
    stats?: Record<string, any>; // Alias for attributes/abilities used in some sheets
    items?: any[];
    // Expanded Details
    level?: { value: number; xp: number; next?: number };
    details?: {
        alignment?: string;
        background?: string;
        ancestry?: string;
        class?: string;
        deity?: string;
        title?: string; // e.g. "Adept"
        languages?: string[] | { name: string; description?: string; isClass?: boolean }[];
        classLanguages?: string[]; // Raw list from class item for matching
        biography?: string;
    };
    luck?: { available: boolean; remaining: number };
    coins?: Record<string, number>;
    effects?: any[];

    // UI Choices (Populated for dropdowns)
    choices?: {
        ancestries?: { name: string; uuid: string }[];
        backgrounds?: { name: string; uuid: string }[];
        alignments?: string[];
    };
}

export interface SystemAdapter {
    systemId: string;

    /**
     * Transforms raw Foundry actor.system data into a normalized UI structure
     */
    normalizeActorData(actor: any): ActorSheetData;

    /**
   * Generates a formula or data for rolling dice
   */
    getRollData(actor: any, type: string, key: string, options?: any): { formula: string; type: string; label: string } | null;
}
