# API Documentation

The Sheet Delver API provides access to Foundry VTT data through a headless session wrapper.

## Authentication
All protected routes require a `Bearer` token in the `Authorization` header.
Tokens are obtained via `/api/login`.

---

## Session & Status

### `GET /api/status`
**Auth**: Try-Auth (Aggregates system + user state)
Returns the current connection status, world metadata, and active user list.

**Response:**
```json
{
  "connected": true,
  "isAuthenticated": true,
  "currentUserId": "...",
  "initialized": true,
  "users": [
    {
      "_id": "...",
      "name": "Gamemaster",
      "curor": "...",
      "role": 4,
      "isGM": true,
      "active": true,
      "img": "..."
    }
  ],
  "system": {
    "id": "shadowdark",
    "status": "active",
    "worldTitle": "...",
    "actorSyncToken": 1739634420,
    "config": { ... }
  },
  "url": "http://foundryServer:30000",
  "appVersion": "0.5.0"
}
```

### `POST /api/login`
**Body**: `{ "username": "...", "password": "..." }`
**Response**: `{ "success": true, "token": "uuid", "userId": "uuid" }`

### `POST /api/logout`
**Auth**: Protected
Destroys the current user session and closes their dedicated socket.

### `GET /api/system`
**Auth**: Protected
Returns basic system information (id, version, world title).

### `GET /api/system/data`
**Auth**: Protected
Returns full system-specific data (ancestries, classes, etc.) adapted from the world.

---

## Actors & Items

### `GET /api/actors`
**Auth**: Protected
Returns actors visible to the current user, separated into `ownedActors` and `readOnlyActors`.

### `GET /api/actors/:id`
**Auth**: Protected
Returns fully normalized actor data. Automatically resolves UUIDs, handles name resolution via the Compendium Cache, and includes system-specific computed data (e.g. slots, AC).

### `PATCH /api/actors/:id`
**Auth**: Protected
Updates actor-level data using dot notation.

### `POST /api/actors/:id/update`
**Auth**: Protected
**Hybrid Update**: Routes updates to either the actor or specific embedded items based on the provided paths (e.g., `items.ID.system.equipped`).

### `POST /api/actors/:id/roll`
**Auth**: Protected
**Body**: 
- `{ "type": "ability", "key": "str" }`
- `{ "type": "formula", "key": "1d20+5" }`
- `{ "type": "use-item", "key": "itemId" }`

---

## Journals & Shared Content

### `GET /api/journals`
**Auth**: Protected
Returns a hierarchical list of journals and folders visible to the user.
**Response**: `{ "journals": [...], "folders": [...] }`

### `POST /api/journals`
**Auth**: Protected
Creates a new journal entry or folder.
**Body**: `{ "type": "JournalEntry" | "Folder", "data": { ... } }`

### `GET /api/journals/:id`
**Auth**: Protected
Returns detailed data for a specific journal entry.

### `PATCH /api/journals/:id`
**Auth**: Protected
Updates an existing journal entry or folder.
**Body**: `{ "type": "JournalEntry" | "Folder", "data": { ... } }`

### `DELETE /api/journals/:id`
**Auth**: Protected
Deletes a journal entry or folder.
**Query**: `type=JournalEntry` or `type=Folder`

### `GET /api/shared-content`
**Auth**: Protected
Returns the latest media or journal shared by the GM with the current user.

### `GET /api/foundry/document?uuid=...`
**Auth**: Protected
Fetches any document (Actor, Item, Journal, Scene) by its universal UUID.


## Shadowdark Module Routes
Base URL: `/api/modules/shadowdark`

### `GET /gear/list`
Returns a list of all gear items from the `gear` and `magic-items` compendiums.

### `GET /spells/list`
Returns a list of all spells from the `spells` compendium.

### `GET /effects/predefined-effects`
Returns the system's predefined effects (e.g., "Blind", "Blessed").

### `GET /roll-table`
Lists all available roll tables from the local Shadowdark data packs.

### `GET /roll-table/:id`
Returns detailed table data, including results.

### `POST /roll-table/:id/draw`
Executes a **local draw** using the backend's Math.random logic.
**Body**: `{ "rollMode": "self", "displayChat": true }`

### `GET /actors/:id/level-up/data`
Returns context data for the Level Up wizard (class, ancestry, available talents).

### `POST /actors/:id/level-up/roll-hp`
Rolls HP for the current level.

### `POST /actors/:id/level-up/roll-gold`
Rolls starting gold for a new character.

### `POST /actors/:id/level-up/roll-talent`
Rolls on the class talent table.

### `POST /actors/:id/level-up/roll-boon`
Rolls on the patron boon table.

### `POST /actors/:id/level-up/resolve-choice`
Resolves a nested choice (e.g. Weapon Mastery selection).

### `POST /actors/:id/level-up/finalize`
Assembles and persists level-up changes to the actor.

### `POST /actors/:id/spells/learn`
Adds a spell to the actor's "Known Spells".

---

## Admin API (Localhost Only)

### `GET /admin/status`
Returns the status of the System Client.

### `POST /admin/world/launch`
**Body**: `{ "worldId": "..." }`
Launches a specific world from setup.

### `POST /admin/world/shutdown`
Shuts down the currently active world.
