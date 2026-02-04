# Foundry V13 Socket Protocol Documentation

This document outlines the socket events and data structures observed for Foundry VTT v13 (via reverse engineering and monitoring).

## Connection Sequence

1.  **Transport Connection**
    *   Client connects via `socket.io` (v4+).
    *   URL: `https://<foundry-host>/socket.io/`
    *   Query Params: `session=<cookie_id>`

2.  **`session` Event**
    *   **Direction**: Server -> Client
    *   **Trigger**: Immediately after connection.
    *   **Payload**:
        ```json
        {
          "sessionId": "c1879181..."
          "userId": "vsdS7qJdxmZS4ZAF" // or null if Guest
        }
        ```
    *   **Notes**: Verification of authentication. If `userId` is present, the connection is authenticated.

3.  **`getJoinData` (Handshake)**
    *   **Direction**: Client -> Server (Emit)
    *   **Purpose**: Fetch initial world state (active users, system info, world metadata).
    *   **Response**:
        ```json
        {
          "world": { "id": "...", "title": "...", "background": "..." },
          "system": { "id": "shadowdark", "version": "..." },
          "users": [ ... ], // Full user objects
          "activeUsers": [ "id1", "id2" ] // List of currently online IDs
        }
        ```

4.  **`ready` / `init`**
    *   **Direction**: Server -> Client
    *   **Payload**: Contains comprehensive world state similar to `getJoinData`.
    *   **Usage**: Signals the world is fully loaded and ready for interaction.

## Core Events

### `modifyDocument`
The primary event for all data changes (CRUD). connection/disconnection of entities often triggers this for `User` documents.

*   **Direction**: Server -> Client
*   **Payload**:
    ```json
    {
      "type": "User", // or "Actor", "Item", "JournalEntry", "Setting"
      "action": "update", // "create", "delete", "get"
      "result": [
        { "_id": "...", "active": true, ... }
      ],
      "broadcast": false
    }
    ```
*   **Notes**: Updates to `User` documents with `active: true/false` are a reliable source of truth for online status if `userDisconnected` is missing.

### `userActivity`
High-frequency event broadcasting transient user state (cursor position, ruler measurement, focus). **Crucially, this event also broadcasts `active: false` when a user logs out.**

*   **Payload**: `[ "userId", { "active": false }]`
*   **Relevance**: Primary signal for real-time logout/disconnect in V13.

### `serverTime`
Heartbeat event syncing server timestamp.
*   **Payload**: Number (timestamp).

## Legacy/Specific Status Events

### `userConnected`
*   **Payload**: User object `{ "_id": "...", "name": "...", "active": true, ... }`
*   **Observed**: Yes.

### `userDisconnected`
*   **Payload**:
    *   Object: `{ "userId": "..." }`
    *   String: `"..."` (Raw ID)
*   **Observed**: **Unreliable/Missing in V13 logs.** Use `userActivity` active flags or `modifyDocument` as fallback.

### `shutdown`
*   **Payload**: `{ "world": "..." }`
*   **Meaning**: The world has been shut down by the GM.

## Additional Discovered Events (Stubs)
*Events identified in client source but not yet fully profiled.*

### Audio / Video
*   `playAudio`, `playAudioPosition`, `preloadAudio`: Server triggering audio playback on clients.
*   `av`: WebRTC/AV communication signaling.

### Scene / Canvas
*   `pullToScene`: GM forcing clients to view a specific scene.
*   `preloadScene`: Pre-loading scene assets.
*   `resetFog`, `syncFog`: Fog of War management.
*   `regionEvent`: Triggering region behavior.

### System / World
*   `pause`: Toggling game pause state.
*   `reload`, `hotReload`: Triggering client refreshes.
*   `world`, `getWorldStatus`: Fetching world availability/status.
*   `time`: Server time sync (Heartbeat).
*   `progress`: Loading bar updates.

### Chat / UI
*   `chatBubble`: Displaying chat bubbles over tokens.
*   `userQuery`: Server asking client for input/confirmation?

### Shared Content
*   `shareImage`: GM sharing an image/media with players.
    *   **Payload**: `[{ image: "path/to/img.webp", title: "Title", uuid: null }]`
*   `showEntry`: GM showing a Journal Entry to players.
    *   **Payload**: `[ "JournalEntry.ID", true ]`
    *   **Note**: The boolean likely represents a "force show" or "show to all" flag.

### Collaboration (ProseMirror)
*   `pm.newSteps`, `pm.usersEditing`, `pm.autosave`: Real-time text editing synchronization.

### File / Compendium
*   `manageFiles`: File system operations.
*   `manageCompendium`: Compendium management.
