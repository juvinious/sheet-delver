export type ServerConnectionStatus =
    | 'disconnected'
    | 'setup'
    | 'active';

// Legacy alias for compatibility during refactor
export type ConnectionStatus = ServerConnectionStatus;
