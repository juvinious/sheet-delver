
import { ConnectionStatus } from '../../types/connection';

export interface SystemConnectionData {
    id: string;
    title: string;
    version: string;
    worldTitle?: string;
    worldBackground?: string;
    worldDescription?: string;
    nextSession?: string | null;
    isLoggedIn?: boolean;
    isAuthenticating?: boolean;
    background?: string;
    users?: { active: number; total: number; list?: any[] };
    status?: ConnectionStatus;
}

export interface FoundryClient {
    // Legacy support (to be deprecated or aliased)
    isConnected: boolean;
    isLoggedIn: boolean;

    // Strict Separation
    isSocketConnected: boolean; // Physical socket connection
    worldState: 'offline' | 'setup' | 'active'; // World Availability
    isUserAuthenticated: boolean; // User Session

    url: string;
    status: ConnectionStatus;

    connect(): Promise<void>;
    disconnect(): void;
    login(username?: string, password?: string): Promise<void>;
    logout(): Promise<void>;

    evaluate<T>(pageFunction: any, arg?: any): Promise<T>;

    getSystem(): Promise<SystemConnectionData>;
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
}
