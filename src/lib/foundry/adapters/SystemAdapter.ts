export interface SystemAdapter {
    /**
     * The system ID this adapter supports.
     */
    systemId: string;

    /**
     * Retrieve and prepare actor data given an ID.
     */
    getActor(client: any, actorId: string): Promise<any>;

    /**
     * Retrieve system-specific configuration data (e.g. compendiums, classes).
     */
    getSystemData(client: any): Promise<any>;
}
