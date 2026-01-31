export interface ActorData {
  id: string;
  name: string;
  type: string;
  img: string;
  system: any; // validation later
}

export interface FoundryConfig {
  url: string;
  username?: string;
  password?: string;
  userId?: string;
  headless?: boolean;
  provider?: 'playwright' | 'bridge';
}
