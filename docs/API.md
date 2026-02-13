# API Documentation

The Sheet Delver API provides access to Foundry VTT data through a headless session wrapper.

## Authentication
All protected routes require a `Bearer` token in the `Authorization` header.
Tokens are obtained via `/api/login`.

## Session & Status

### `GET /api/status`
**Auth**: Public (Limited) / Protected
Returns the current connection status of the headless client and the Foundry world.
Also used for polling via `/api/session/connect`.

**Response:**
```json
{
  "connected": true,
  "isAuthenticated": true,
  "initialized": true,
  "users": [
    {
      "name": "Gamemaster",
      "role": 4,
      "isGM": true,
      "active": true,
      "img": "..."
    }
  ],
  "system": {
    "id": "shadowdark",
    "status": "active"
  }
}
```

### `GET /api/session/users`
**Auth**: Protected
Returns a list of all users in the world, with sanitized URLs and role flags.

**Response:**
```json
{
  "users": [ ... ]
}
```

### `POST /api/login`
**Body**: `{ "username": "...", "password": "..." }`
**Response**: `{ "success": true, "token": "uuid", "userId": "uuid" }`

### `POST /api/logout`
**Auth**: Protected
Destroys the current session.

## Foundry System Data

### `GET /api/system`
Returns basic system information (id, version, world title).

### `GET /api/system/data`
Returns full system-specific data (ancestries, classes, roll tables) scraped or adapted from the world.

## Actors & Items

### `GET /api/actors`
Returns a list of actors visible to the current user (Owned + Observed).

### `GET /api/actors/:id`
Returns detailed data for a specific actor.

### `PATCH /api/actors/:id`
Updates actor data.
**Body**: `{ "system.abilities.str.value": 14 }` (Dot notation supported)

### `POST /api/actors/:id/roll`
Executes a roll for an actor.
**Body**: `{ "type": "ability", "key": "str" }` or `{ "type": "item", "key": "itemId" }`

### `POST /api/actors/:id/items`
Creates a new item on the actor.

### `DELETE /api/actors/:id/items?itemId=...`
Deletes an item from the actor.

## Chat & Journal

### `GET /api/chat`
Returns recent chat messages.

### `POST /api/chat/send`
Sends a message or roll command to chat.

### `GET /api/journals`
Returns visible journal entries.

### `GET /api/foundry/document?uuid=...`
Fetches a specific document by UUID.

## Roll Tables

### `POST /api/foundry/roll-table`
**Auth**: Protected
Executes a roll on a specific RollTable by UUID.

**Body**: 
```json
{ 
  "uuid": "Compendium.shadowdark.rollable-tables.RQ0vogfVtJGuT9oT",
  "rollMode": "self", // optional: public, private, blind, self (default)
  "displayChat": true // optional: default true
}
```

**Response**:
```json
{
  "roll": { ... }, // Roll object
  "results": [ ... ], // Array of TableResult objects
  "total": 12
}
```

## Shadowdark Module Routes
Base URL: `/api/modules/shadowdark`

### `GET /gear/list`
Returns a list of all gear items from the `gear` and `magic-items` compendiums.
**Response**: Array of Item objects.

### `GET /spells/list`
Returns a list of all spells from the `spells` compendium.
**Response**: Array of Item objects.

### `GET /effects/predefined-effects`
Returns the system's predefined effects (e.g., "Blind", "Blessed").

### `GET /actors/:id/level-up/data`
Returns context data for the Level Up wizard (class, ancestry, available talents).

### `POST /actors/:id/level-up/roll-hp`
Rolls HP for the current level.
**Response**: `{ "roll": { "total": 4, "result": "1d4" }, "success": true }`

### `POST /actors/:id/level-up/roll-gold`
Rolls starting gold for a new character.
**Response**: `{ "roll": { "total": 10, "result": "2d6 * 5" }, "success": true }`

### `POST /actors/:id/level-up/roll-talent`
**Auth**: Protected
Rolls on the class talent table.
**Body**:
```json
{
  "tableUuidOrName": "...",
  "targetLevel": 1
}
```

### `POST /actors/:id/level-up/roll-boon`
**Auth**: Protected
Rolls on the patron boon table.
**Body**:
```json
{
  "tableUuidOrName": "...",
  "targetLevel": 1
}
```

### `POST /actors/:id/level-up/resolve-choice`
**Auth**: Protected
Resolves a nested choice (e.g. Weapon Mastery selection).
**Body**:
```json
{
  "type": "weapon-mastery",
  "selection": "..."
}
```

### `POST /actors/:id/level-up/finalize`
**Auth**: Protected
Assembles and persistence level-up changes.
**Body**:
```json
{
  "targetLevel": 1,
  "classUuid": "...",
  "ancestryUuid": "...",
  "patronUuid": "...",
  "rolledTalents": [ ... ],
  "rolledBoons": [ ... ],
  "selectedSpells": [ ... ],
  "hpRoll": 4,
  "gold": 10,
  "languages": [ "uuid1", "uuid2" ],
  "statSelection": { "required": 0, "selected": [] },
  "statPool": { "total": 0, "allocated": {}, "talentIndex": null },
  "weaponMasterySelection": { "required": 0, "selected": [] },
  "armorMasterySelection": { "required": 0, "selected": [] },
  "extraSpellSelection": { "active": false, "maxTier": 0, "source": "", "selected": [] }
}
```
**Response**:
```json
{
  "success": true,
  "items": [ ... ], // Assembled items
  "updates": { ... }, // Actor updates applied
  "hpRoll": 4,
  "goldRoll": 10
}
```

### `POST /actors/:id/spells/learn`
Adds a spell to the actor's "Known Spells" (or relevant ability).
**Body**: `{ "spellId": "uuid" }`
