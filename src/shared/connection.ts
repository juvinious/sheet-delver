export type ServerConnectionStatus =
    | 'disconnected'   // Not connected to Foundry
    | 'setup'          // Connected to Foundry setup page (no world active)
    | 'startup'        // World is launching/starting up
    | 'connected'      // Connected to active world (guest)
    | 'loggedIn'       // Connected and authenticated
    | 'active';        // Alias for connected (legacy compatibility)

// Legacy alias for compatibility during refactor
export type ConnectionStatus = ServerConnectionStatus;
