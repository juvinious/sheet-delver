import { ServerConnectionStatus } from '@/shared/connection';
import { SystemInfo } from '@/shared/interfaces';

export type { SystemInfo };

export interface FoundryClient {
    // Legacy support (to be deprecated or aliased)
    isConnected: boolean;
    isLoggedIn: boolean;
    userId: string | null;

    // Strict Separation
    isSocketConnected: boolean; // Physical socket connection
    worldState: 'offline' | 'setup' | 'active'; // World Availability
    isUserAuthenticated: boolean; // User Session

    url: string;
    status: ServerConnectionStatus;

    connect(): Promise<void>;
    disconnect(): void;
    login(username?: string, password?: string): Promise<void>;
    logout(): Promise<void>;

    evaluate<T>(pageFunction: any, arg?: any): Promise<T>;

    getSystem(): Promise<SystemInfo>;
    getUsers(): Promise<any[]>;
    getUsersDetails(): Promise<any[]>;
    getCurrentUserId(): string | null;
    getSystemData(): Promise<any>;
    getActors(): Promise<any[]>;
    getActor(id: string, forceSystemId?: string): Promise<any>;

    getAllCompendiumIndices(): Promise<any[]>;

    updateActor(id: string, data: any): Promise<any>;
    createActor(data: any): Promise<any>;
    deleteActor(id: string): Promise<any>;

    updateActorEffect(actorId: string, effectId: string, updateData: any): Promise<any>;
    deleteActorEffect(actorId: string, effectId: string): Promise<any>;

    createActorItem(actorId: string, itemData: any): Promise<any>;
    updateActorItem(actorId: string, itemData: any): Promise<any>;
    deleteActorItem(actorId: string, itemId: string): Promise<any>;

    toggleStatusEffect(actorId: string, effectId: string, active?: boolean, overlay?: boolean): Promise<any>;

    getChatLog(limit?: number): Promise<any[]>;
    sendMessage(content: string | any): Promise<any>;

    useItem(actorId: string, itemId: string): Promise<any>;
    roll(formula: string, flavor?: string): Promise<any>;

    // World Management (Admin CLI)
    getWorlds(): Promise<any[]>;
    launchWorld(worldId: string): Promise<void>;
    shutdownWorld(): Promise<void>;
}
