export interface ActorData {
  id: string;
  name: string;
  type: string;
  img: string;
  system: any; // validation later
}

export interface FoundryConfig {
  url?: string;
  host?: string;
  port?: number | string;
  protocol?: string;
  username?: string;
  password?: string;
  userId?: string;
  connector?: string;
}
